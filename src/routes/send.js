/**
 * POST /api/send — Manual trigger for newsletter sending.
 * Also exports checkFeedsAndSend for the cron handler.
 */

import pkg from "../../package.json" with { type: "json" };
import { getChannels, getChannelById } from "../lib/config.js";
import { fetchAndParseFeed } from "../lib/feed-parser.js";
import { sendEmail } from "../lib/email.js";
import { htmlToText, constrainImages } from "../lib/html-to-text.js";
import { render } from "../lib/templates.js";
import {
  isFeedSeeded,
  isItemSent,
  insertSentItem,
  getVerifiedSubscribers,
  isItemSentToSubscriber,
  insertSubscriberSend,
  deleteSubscriberSends,
} from "../lib/db.js";

const USER_AGENT = `feedmail/${pkg.version}`;

/**
 * Handle a manual send request.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function handleSend(request, env) {
  let targetChannelId = null;

  try {
    const body = await request.json();
    targetChannelId = body.channelId || null;
  } catch {
    // No body or invalid JSON — send for all channels
  }

  const result = await checkFeedsAndSend(env, targetChannelId);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Check all configured feeds for new items and send emails.
 * Called by both the cron handler and the manual send endpoint.
 * @param {object} env
 * @param {string|null} [targetChannelId] - Optional: only process this channel
 * @returns {Promise<object>} Summary of what was sent
 */
export async function checkFeedsAndSend(env, targetChannelId = null) {
  const channels = getChannels(env);
  const summary = { sent: 0, items: [], seeded: false };

  for (const channel of channels) {
    if (targetChannelId && channel.id !== targetChannelId) continue;

    try {
      await processChannelFeeds(env, channel, summary);
    } catch (err) {
      console.error(`Error processing channel ${channel.id}:`, err);
    }
  }

  return summary;
}

/**
 * Process all feeds for a single channel.
 */
async function processChannelFeeds(env, channel, summary) {
  if (!channel.feeds || channel.feeds.length === 0) return;

  const unseenItems = [];

  for (const feed of channel.feeds) {
    const feedUrl = feed.url;
    try {
      const items = await fetchAndParseFeed(feedUrl, USER_AGENT);

      // Bootstrapping: if this feed has never been seeded, seed it
      const seeded = await isFeedSeeded(env.DB, feedUrl);
      if (!seeded) {
        console.log(
          `Seeding ${items.length} existing items for ${feedUrl}. No emails sent.`,
        );
        for (const item of items) {
          await insertSentItem(env.DB, {
            itemId: item.id,
            feedUrl,
            title: item.title,
            recipientCount: 0,
          });
        }
        summary.seeded = true;
        continue;
      }

      // Find unsent items
      for (const item of items) {
        const sent = await isItemSent(env.DB, item.id, feedUrl);
        if (!sent) {
          unseenItems.push({ ...item, feedUrl });
        }
      }
    } catch (err) {
      console.error(`Error fetching feed ${feedUrl}:`, err);
    }
  }

  if (unseenItems.length === 0) return;

  // Get verified subscribers for this channel
  const subscribers = await getVerifiedSubscribers(env.DB, channel.id);

  if (subscribers.length === 0) {
    // No subscribers — mark items as sent with 0 recipients
    for (const item of unseenItems) {
      await insertSentItem(env.DB, {
        itemId: item.id,
        feedUrl: item.feedUrl,
        title: item.title,
        recipientCount: 0,
      });
    }
    console.log(
      `No subscribers for ${channel.id}. Marked ${unseenItems.length} items as sent.`,
    );
    return;
  }

  // Send each unseen item to all subscribers
  for (const item of unseenItems) {
    const result = await sendItemToSubscribers(
      env,
      channel,
      item,
      subscribers,
    );

    // Only mark the item as fully sent if all subscribers were reached
    // (no quota interruption). This ensures the next run retries any
    // subscribers that were missed.
    if (result.complete) {
      await insertSentItem(env.DB, {
        itemId: item.id,
        feedUrl: item.feedUrl,
        title: item.title,
        recipientCount: result.sent,
      });
      // Clean up per-subscriber tracking rows — no longer needed once the
      // item is recorded in sent_items (isItemSent will skip it from now on).
      await deleteSubscriberSends(env.DB, item.id, item.feedUrl);
    }

    summary.sent += result.sent;
    summary.items.push({
      title: item.title,
      recipients: result.sent,
      complete: result.complete,
      channelId: channel.id,
    });

    console.log(
      `Sent "${item.title}" to ${result.sent} subscribers for ${channel.id}` +
        (result.complete ? "" : " (incomplete — quota exhausted, will retry)"),
    );

    // If quota was exhausted, stop processing further items for this channel —
    // all subsequent sends would fail too.
    if (!result.complete) break;
  }
}

/**
 * Send a single feed item to all verified subscribers.
 *
 * Uses subscriber_sends for per-subscriber deduplication so that partial
 * sends (interrupted by quota exhaustion) can be resumed on the next run
 * without re-sending to subscribers who already received the item.
 *
 * @returns {{ sent: number, complete: boolean }}
 *   sent — number of emails successfully delivered this run
 *   complete — true if all subscribers were reached (safe to mark item as done)
 */
async function sendItemToSubscribers(env, channel, item, subscribers) {
  // Determine email content
  const rawContent = item.content || item.summary || "";
  const emailContent = constrainImages(rawContent);
  const hasFullContent = !!item.content;
  const textContent = htmlToText(rawContent);

  // Render the email templates
  const emailHtml = render("newsletter", {
    title: item.title,
    date: item.date,
    link: item.link,
    content: emailContent,
    hasFullContent,
    summary: item.summary,
    siteName: channel.siteName,
    siteUrl: channel.siteUrl,
    companyName: channel.companyName,
    companyAddress: channel.companyAddress,
    // unsubscribeUrl is replaced per-subscriber below
    unsubscribeUrl: "%%UNSUBSCRIBE_URL%%",
  });

  const emailText = render("newsletterText", {
    title: item.title,
    date: item.date,
    link: item.link,
    textContent,
    siteName: channel.siteName,
    companyName: channel.companyName,
    companyAddress: channel.companyAddress,
    // unsubscribeUrl is replaced per-subscriber below
    unsubscribeUrl: "%%UNSUBSCRIBE_URL%%",
  });

  let sent = 0;

  for (const subscriber of subscribers) {
    // Skip if this subscriber already received this item (from a previous
    // partial run that was interrupted by quota exhaustion).
    const alreadySent = await isItemSentToSubscriber(
      env.DB,
      subscriber.id,
      item.id,
      item.feedUrl,
    );
    if (alreadySent) continue;

    const unsubscribeUrl = `https://${env.DOMAIN}/api/unsubscribe?token=${subscriber.unsubscribe_token}`;

    const personalizedHtml = emailHtml.replace(
      /%%UNSUBSCRIBE_URL%%/g,
      unsubscribeUrl,
    );
    const personalizedText = emailText.replace(
      /%%UNSUBSCRIBE_URL%%/g,
      unsubscribeUrl,
    );

    const result = await sendEmail(env.RESEND_API_KEY, {
      from: `${channel.fromUser}@${env.DOMAIN}`,
      fromName: channel.fromName,
      replyTo: channel.replyTo,
      to: subscriber.email,
      subject: item.title,
      html: personalizedHtml,
      text: personalizedText,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (result.success) {
      await insertSubscriberSend(env.DB, subscriber.id, item.id, item.feedUrl);
      sent++;
    } else if (result.quotaExhausted) {
      // Quota or rate limit exhausted after retries — stop the loop.
      // Don't mark the item as sent so the next run retries the remaining
      // subscribers.
      console.error(
        `Quota exhausted sending to ${subscriber.email}: ${result.error}`,
      );
      return { sent, complete: false };
    } else {
      // Permanent failure (bad address, validation error, etc.) —
      // log and continue to the next subscriber.
      console.error(
        `Failed to send to ${subscriber.email}: ${result.error}`,
      );
    }
  }

  return { sent, complete: true };
}
