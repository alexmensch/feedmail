/**
 * POST /api/subscribe
 * Handles new subscription requests with rate limiting.
 */

import { getChannelById, getVerifyLimits } from "../../shared/lib/config.js";
import { jsonResponse } from "../../shared/lib/response.js";
import { sendEmail } from "../../shared/lib/email.js";
import { render } from "../../shared/lib/templates.js";
import {
  getSubscriberByEmail,
  insertSubscriber,
  resetSubscriberToPending,
  updateVerifyToken,
  countRecentVerificationAttempts,
  insertVerificationAttempt,
  getResendApiKey
} from "../../shared/lib/db.js";

// Basic email validation (RFC 5322 simplified, ReDoS-safe)
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

// Only these fields are accepted in the request body.
// Any additional field causes rejection (enables invisible honeypot fields).
const ALLOWED_FIELDS = new Set(["email", "channelId"]);

const SUCCESS_RESPONSE = {
  success: true,
  message: "Check your email to confirm your subscription"
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
      message: "Invalid request body"
    });
  }

  // Reject requests with unexpected fields (honeypot support).
  // Uses the same error message as invalid JSON to avoid leaking info.
  const hasUnexpectedFields = Object.keys(body).some(
    (key) => !ALLOWED_FIELDS.has(key)
  );
  if (hasUnexpectedFields) {
    return jsonResponse(400, {
      success: false,
      message: "Invalid request body"
    });
  }

  const { email, channelId } = body;

  // Validate channelId
  if (!channelId) {
    return jsonResponse(400, {
      success: false,
      message: "Missing channel identifier"
    });
  }

  const channel = await getChannelById(env, channelId);
  if (!channel) {
    return jsonResponse(400, {
      success: false,
      message: "Unknown channel"
    });
  }

  // Validate email
  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonResponse(400, {
      success: false,
      message: "Please provide a valid email address"
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check for existing subscriber
  const existing = await getSubscriberByEmail(
    env.DB,
    normalizedEmail,
    channelId
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
      await trySendVerification(
        env,
        channel,
        normalizedEmail,
        newToken,
        existing.id,
        existing.unsubscribe_token
      );
      return jsonResponse(200, SUCCESS_RESPONSE);
    }

    if (existing.status === "unsubscribed") {
      // Re-subscribe: reset to pending
      const newToken = crypto.randomUUID();
      await resetSubscriberToPending(env.DB, existing.id, newToken);
      await trySendVerification(
        env,
        channel,
        normalizedEmail,
        newToken,
        existing.id,
        existing.unsubscribe_token
      );
      return jsonResponse(200, SUCCESS_RESPONSE);
    }
  }

  // New subscriber
  const verifyToken = crypto.randomUUID();
  const unsubscribeToken = crypto.randomUUID();

  const result = await insertSubscriber(env.DB, {
    channelId,
    email: normalizedEmail,
    verifyToken,
    unsubscribeToken
  });

  const subscriberId =
    result.meta?.last_row_id ||
    (await getSubscriberByEmail(env.DB, normalizedEmail, channelId))?.id;

  await trySendVerification(
    env,
    channel,
    normalizedEmail,
    verifyToken,
    subscriberId,
    unsubscribeToken
  );

  return jsonResponse(200, SUCCESS_RESPONSE);
}

/**
 * Check rate limit and send verification email if allowed.
 */
async function trySendVerification(
  env,
  channel,
  email,
  verifyToken,
  subscriberId,
  unsubscribeToken
) {
  const limits = await getVerifyLimits(env);
  const recentCount = await countRecentVerificationAttempts(
    env.DB,
    subscriberId,
    limits.windowHours
  );

  if (recentCount >= limits.maxAttempts) {
    console.log(
      `Rate limit hit for subscriber ${subscriberId}: ${recentCount}/${limits.maxAttempts} in ${limits.windowHours}h`
    );
    return; // Silently skip — no info leak
  }

  const verifyUrl = `https://${env.DOMAIN}/api/verify?token=${verifyToken}`;
  const unsubscribeUrl = `https://${env.DOMAIN}/api/unsubscribe?token=${unsubscribeToken}`;

  const html = render("verificationEmail", {
    siteName: channel.siteName,
    siteUrl: channel.siteUrl,
    verifyUrl,
    unsubscribeUrl,
    companyName: channel.companyName,
    companyAddress: channel.companyAddress
  });

  const textLines = [
    `Confirm your subscription to ${channel.siteName}`,
    "",
    "Click the link below to confirm your email address:",
    verifyUrl,
    "",
    "This link expires in 24 hours.",
    "",
    "If you didn't request this, you can safely ignore this email.",
    "",
    `Unsubscribe: ${unsubscribeUrl}`
  ];
  if (channel.companyName) {
    textLines.push(channel.companyName);
  }
  if (channel.companyAddress) {
    textLines.push(channel.companyAddress);
  }
  const text = textLines.join("\n");

  // Resolve Resend API key (env var first, then D1)
  const resendApiKey = await getResendApiKey(env);
  if (!resendApiKey) {
    console.error(
      "Resend API key not configured — cannot send verification email"
    );
    return;
  }

  const result = await sendEmail(resendApiKey, {
    from: `${channel.fromUser}@${env.DOMAIN}`,
    fromName: channel.fromName,
    replyTo: channel.replyTo,
    to: email,
    subject: `Confirm your subscription to ${channel.siteName}`,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  });

  if (result.success) {
    await insertVerificationAttempt(env.DB, subscriberId);
  } else {
    console.error("Failed to send verification email:", result.error);
  }
}
