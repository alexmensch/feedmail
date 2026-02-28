/**
 * POST /api/send — Manual trigger for newsletter sending.
 * Also exports checkFeedsAndSend for the cron handler.
 */

import pkg from "../../package.json" with { type: "json" };
import { getSites, getSiteById } from "../lib/config.js";
import { fetchAndParseFeed } from "../lib/feed-parser.js";
import { sendEmail } from "../lib/email.js";
import { htmlToText, constrainImages } from "../lib/html-to-text.js";
import { render } from "../lib/templates.js";
import {
  isFeedSeeded,
  isItemSent,
  insertSentItem,
  getVerifiedSubscribers,
} from "../lib/db.js";

const USER_AGENT = `feedmail/${pkg.version}`;

/**
 * Handle a manual send request.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function handleSend(request, env) {
  let targetSiteId = null;

  try {
    const body = await request.json();
    targetSiteId = body.siteId || null;
  } catch {
    // No body or invalid JSON — send for all sites
  }

  const result = await checkFeedsAndSend(env, targetSiteId);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Check all configured feeds for new items and send emails.
 * Called by both the cron handler and the manual send endpoint.
 * @param {object} env
 * @param {string|null} [targetSiteId] - Optional: only process this site
 * @returns {Promise<object>} Summary of what was sent
 */
export async function checkFeedsAndSend(env, targetSiteId = null) {
  const sites = getSites(env);
  const summary = { sent: 0, items: [], seeded: false };

  for (const site of sites) {
    if (targetSiteId && site.id !== targetSiteId) continue;

    try {
      await processSiteFeeds(env, site, summary);
    } catch (err) {
      console.error(`Error processing site ${site.id}:`, err);
    }
  }

  return summary;
}

/**
 * Process all feeds for a single site.
 */
async function processSiteFeeds(env, site, summary) {
  const unseenItems = [];

  for (const feedUrl of site.feeds) {
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

  // Get verified subscribers for this site
  const subscribers = await getVerifiedSubscribers(env.DB, site.id);

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
      `No subscribers for ${site.id}. Marked ${unseenItems.length} items as sent.`,
    );
    return;
  }

  // Send each unseen item to all subscribers
  for (const item of unseenItems) {
    const recipientCount = await sendItemToSubscribers(
      env,
      site,
      item,
      subscribers,
    );

    await insertSentItem(env.DB, {
      itemId: item.id,
      feedUrl: item.feedUrl,
      title: item.title,
      recipientCount,
    });

    summary.sent += recipientCount;
    summary.items.push({
      title: item.title,
      recipients: recipientCount,
      siteId: site.id,
    });

    console.log(
      `Sent "${item.title}" to ${recipientCount} subscribers for ${site.id}`,
    );
  }
}

/**
 * Send a single feed item to all verified subscribers.
 * Returns the number of successful sends.
 */
async function sendItemToSubscribers(env, site, item, subscribers) {
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
    siteName: site.name,
    siteUrl: site.url,
    // unsubscribeUrl is replaced per-subscriber below
    unsubscribeUrl: "%%UNSUBSCRIBE_URL%%",
  });

  const emailText = render("newsletterText", {
    title: item.title,
    date: item.date,
    link: item.link,
    textContent,
    siteName: site.name,
    // unsubscribeUrl is replaced per-subscriber below
    unsubscribeUrl: "%%UNSUBSCRIBE_URL%%",
  });

  let successCount = 0;

  for (const subscriber of subscribers) {
    const unsubscribeUrl = `https://feedmail.cc/api/unsubscribe?token=${subscriber.unsubscribe_token}`;

    const personalizedHtml = emailHtml.replace(
      /%%UNSUBSCRIBE_URL%%/g,
      unsubscribeUrl,
    );
    const personalizedText = emailText.replace(
      /%%UNSUBSCRIBE_URL%%/g,
      unsubscribeUrl,
    );

    const result = await sendEmail(env.RESEND_API_KEY, {
      from: site.fromEmail,
      fromName: site.fromName,
      replyTo: site.replyTo,
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
      successCount++;
    } else {
      console.error(
        `Failed to send to ${subscriber.email}:`,
        result.error,
      );
    }
  }

  return successCount;
}
