/**
 * POST /api/subscribe
 * Handles new subscription requests with rate limiting.
 */

import { getSiteById, getVerifyLimits } from "../lib/config.js";
import { sendEmail } from "../lib/email.js";
import { render } from "../lib/templates.js";
import {
  getSubscriberByEmail,
  insertSubscriber,
  resetSubscriberToPending,
  updateVerifyToken,
  countRecentVerificationAttempts,
  insertVerificationAttempt,
} from "../lib/db.js";

// Basic email validation (RFC 5322 simplified, ReDoS-safe)
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

// Only these fields are accepted in the request body.
// Any additional field causes rejection (enables invisible honeypot fields).
const ALLOWED_FIELDS = new Set(["email", "siteId"]);

const SUCCESS_RESPONSE = {
  success: true,
  message: "Check your email to confirm your subscription",
};

/**
 * Handle a subscribe request.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function handleSubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, {
      success: false,
      message: "Invalid request body",
    });
  }

  // Reject requests with unexpected fields (honeypot support).
  // Uses the same error message as invalid JSON to avoid leaking info.
  const hasUnexpectedFields = Object.keys(body).some(
    (key) => !ALLOWED_FIELDS.has(key),
  );
  if (hasUnexpectedFields) {
    return jsonResponse(400, {
      success: false,
      message: "Invalid request body",
    });
  }

  const { email, siteId } = body;

  // Validate siteId
  if (!siteId) {
    return jsonResponse(400, {
      success: false,
      message: "Missing site identifier",
    });
  }

  const site = getSiteById(env, siteId);
  if (!site) {
    return jsonResponse(400, {
      success: false,
      message: "Unknown site",
    });
  }

  // Validate email
  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonResponse(400, {
      success: false,
      message: "Please provide a valid email address",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check for existing subscriber
  const existing = await getSubscriberByEmail(
    env.DB,
    normalizedEmail,
    siteId,
  );

  if (existing) {
    if (existing.status === "verified") {
      // Already subscribed — return success without sending email (no info leak)
      return jsonResponse(200, SUCCESS_RESPONSE);
    }

    if (existing.status === "pending") {
      // Regenerate token and resend if under rate limit
      const newToken = crypto.randomUUID();
      await updateVerifyToken(env.DB, existing.id, newToken);
      await trySendVerification(env, site, normalizedEmail, newToken, existing.id, existing.unsubscribe_token);
      return jsonResponse(200, SUCCESS_RESPONSE);
    }

    if (existing.status === "unsubscribed") {
      // Re-subscribe: reset to pending
      const newToken = crypto.randomUUID();
      await resetSubscriberToPending(env.DB, existing.id, newToken);
      await trySendVerification(env, site, normalizedEmail, newToken, existing.id, existing.unsubscribe_token);
      return jsonResponse(200, SUCCESS_RESPONSE);
    }
  }

  // New subscriber
  const verifyToken = crypto.randomUUID();
  const unsubscribeToken = crypto.randomUUID();

  const result = await insertSubscriber(env.DB, {
    siteId,
    email: normalizedEmail,
    verifyToken,
    unsubscribeToken,
  });

  const subscriberId =
    result.meta?.last_row_id ||
    (await getSubscriberByEmail(env.DB, normalizedEmail, siteId))?.id;

  await trySendVerification(env, site, normalizedEmail, verifyToken, subscriberId, unsubscribeToken);

  return jsonResponse(200, SUCCESS_RESPONSE);
}

/**
 * Check rate limit and send verification email if allowed.
 */
async function trySendVerification(env, site, email, verifyToken, subscriberId, unsubscribeToken) {
  const limits = getVerifyLimits(env);
  const recentCount = await countRecentVerificationAttempts(
    env.DB,
    subscriberId,
    limits.windowHours,
  );

  if (recentCount >= limits.maxAttempts) {
    console.log(
      `Rate limit hit for subscriber ${subscriberId}: ${recentCount}/${limits.maxAttempts} in ${limits.windowHours}h`,
    );
    return; // Silently skip — no info leak
  }

  const verifyUrl = `${env.BASE_URL}/api/verify?token=${verifyToken}`;
  const unsubscribeUrl = `${env.BASE_URL}/api/unsubscribe?token=${unsubscribeToken}`;

  const html = render("verificationEmail", {
    siteName: site.name,
    siteUrl: site.url,
    verifyUrl,
    unsubscribeUrl,
    companyName: site.companyName,
    companyAddress: site.companyAddress,
  });

  const textLines = [
    `Confirm your subscription to ${site.name}`,
    "",
    "Click the link below to confirm your email address:",
    verifyUrl,
    "",
    "This link expires in 24 hours.",
    "",
    "If you didn't request this, you can safely ignore this email.",
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
  ];
  if (site.companyName) textLines.push(site.companyName);
  if (site.companyAddress) textLines.push(site.companyAddress);
  const text = textLines.join("\n");

  const result = await sendEmail(env.RESEND_API_KEY, {
    from: site.fromEmail,
    fromName: site.fromName,
    replyTo: site.replyTo,
    to: email,
    subject: `Confirm your subscription to ${site.name}`,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (result.success) {
    await insertVerificationAttempt(env.DB, subscriberId);
  } else {
    console.error("Failed to send verification email:", result.error);
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
