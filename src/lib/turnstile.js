/**
 * Cloudflare Turnstile server-side verification.
 */

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Turnstile token.
 * @param {string} secretKey - Turnstile secret key
 * @param {string} token - The token from the client widget
 * @param {string} [remoteIp] - Optional client IP for additional validation
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function verifyTurnstile(secretKey, token, remoteIp) {
  if (!token) {
    return { success: false, error: "Missing Turnstile token" };
  }

  const body = {
    secret: secretKey,
    response: token,
  };

  if (remoteIp) {
    body.remoteip = remoteIp;
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      error: `Turnstile verification failed: ${(result["error-codes"] || []).join(", ")}`,
    };
  } catch (err) {
    return { success: false, error: `Turnstile request failed: ${err.message}` };
  }
}
