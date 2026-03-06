/**
 * GET /api/verify?token=xxx
 * Handles email verification link clicks.
 */

import { getChannelById } from "../lib/config.js";
import { render, renderErrorPage } from "../lib/templates.js";
import {
  getSubscriberByVerifyToken,
  markSubscriberVerified,
  clearVerificationAttempts,
} from "../lib/db.js";

/**
 * Handle a verification request.
 * @param {Request} request
 * @param {object} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleVerify(request, env, url) {
  const token = url.searchParams.get("token");

  if (!token) {
    return await renderErrorPage(env, null, "This link is invalid or has expired. Please try subscribing again.");
  }

  const subscriber = await getSubscriberByVerifyToken(env.DB, token);

  if (!subscriber) {
    return await renderErrorPage(env, null, "This link is invalid or has expired. Please try subscribing again.");
  }

  // Check if token has expired (24 hours from created_at)
  const createdAt = new Date(subscriber.created_at + "Z");
  const now = new Date();
  const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

  if (hoursSinceCreation > 24) {
    return await renderErrorPage(
      env,
      subscriber.channel_id,
      "This link is invalid or has expired. Please try subscribing again.",
    );
  }

  // Mark as verified
  await markSubscriberVerified(env.DB, subscriber.id);

  // Clear verification attempt history
  await clearVerificationAttempts(env.DB, subscriber.id);

  const channel = await getChannelById(env.DB, subscriber.channel_id);

  const html = render("verifyPage", {
    siteName: channel?.siteName || "the newsletter",
    siteUrl: channel?.siteUrl || "/",
  });

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
