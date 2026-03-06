/**
 * GET/POST /api/unsubscribe?token=xxx
 * Handles unsubscribe requests (link clicks and List-Unsubscribe-Post).
 */

import { getChannelById } from "../lib/config.js";
import { render, renderErrorPage } from "../lib/templates.js";
import {
  getSubscriberByUnsubscribeToken,
  markSubscriberUnsubscribed,
} from "../lib/db.js";

/**
 * Handle an unsubscribe request.
 * @param {Request} request
 * @param {object} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleUnsubscribe(request, env, url) {
  const token = url.searchParams.get("token");

  if (!token) {
    return await renderErrorPage(env, null, "Invalid unsubscribe link.");
  }

  const subscriber = await getSubscriberByUnsubscribeToken(env.DB, token);

  if (!subscriber) {
    return await renderErrorPage(env, null, "Invalid unsubscribe link.");
  }

  // Mark as unsubscribed (idempotent — already-unsubscribed is fine)
  if (subscriber.status !== "unsubscribed") {
    await markSubscriberUnsubscribed(env.DB, subscriber.id);
  }

  const channel = await getChannelById(env.DB, subscriber.channel_id);

  // POST requests come from List-Unsubscribe-Post (RFC 8058) — return 200 OK
  if (request.method === "POST") {
    return new Response("OK", { status: 200 });
  }

  // GET requests render the confirmation page
  const html = render("unsubscribePage", {
    siteName: channel?.siteName || "the newsletter",
    siteUrl: channel?.siteUrl || "/",
  });

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
