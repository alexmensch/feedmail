/**
 * GET /api/verify?token=xxx
 * Handles email verification link clicks.
 */

import { getSiteById } from "../lib/config.js";
import { render } from "../lib/templates.js";
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
    return errorPage(env, null, "This link is invalid or has expired. Please try subscribing again.");
  }

  const subscriber = await getSubscriberByVerifyToken(env.DB, token);

  if (!subscriber) {
    return errorPage(env, null, "This link is invalid or has expired. Please try subscribing again.");
  }

  // Check if token has expired (24 hours from created_at)
  const createdAt = new Date(subscriber.created_at + "Z");
  const now = new Date();
  const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

  if (hoursSinceCreation > 24) {
    return errorPage(
      env,
      subscriber.site_id,
      "This link is invalid or has expired. Please try subscribing again.",
    );
  }

  // Mark as verified
  await markSubscriberVerified(env.DB, subscriber.id);

  // Clear verification attempt history
  await clearVerificationAttempts(env.DB, subscriber.id);

  const site = getSiteById(env, subscriber.site_id);

  const html = render("verifyPage", {
    siteName: site?.name || "the newsletter",
    siteUrl: site?.url || "/",
  });

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function errorPage(env, siteId, message) {
  const site = siteId ? getSiteById(env, siteId) : null;

  const html = render("errorPage", {
    siteName: site?.name || "feedmail",
    siteUrl: site?.url || "/",
    errorMessage: message,
  });

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
