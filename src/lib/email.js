/**
 * Email sending via Resend REST API with rate limit handling.
 * https://resend.com/docs/api-reference/emails/send-email
 * https://resend.com/docs/api-reference/rate-limit
 */

const RESEND_API_URL = "https://api.resend.com/emails";

/** Max number of retries on 429 responses. */
const MAX_RETRIES = 3;

/** Don't wait longer than this (seconds) for a single retry-after. */
const MAX_RETRY_WAIT = 60;

/**
 * Send an email via Resend with automatic retry on rate limits.
 *
 * Returns a result object with:
 *   - success: true — email was accepted
 *   - success: false, quotaExhausted: true — 429 after all retries (daily/monthly limit or persistent rate limit)
 *   - success: false, quotaExhausted: false — permanent failure (bad request, auth error, etc.)
 *
 * @param {string} apiKey - Resend API key
 * @param {object} options
 * @param {string} options.from - Sender email
 * @param {string} options.fromName - Sender display name
 * @param {string} [options.replyTo] - Reply-to email (defaults to from)
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content
 * @param {object} [options.headers] - Additional email headers (e.g. List-Unsubscribe)
 * @returns {Promise<{ success: boolean, error?: string, quotaExhausted?: boolean }>}
 */
export async function sendEmail(
  apiKey,
  { from, fromName, replyTo, to, subject, html, text, headers }
) {
  const payload = {
    from: fromName ? `${fromName} <${from}>` : from,
    to,
    reply_to: replyTo || from,
    subject,
    html,
    text
  };

  if (headers && Object.keys(headers).length > 0) {
    payload.headers = headers;
  }

  const requestOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };

  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(RESEND_API_URL, requestOptions);

      if (response.ok) {
        return { success: true };
      }

      // Rate limited — wait and retry
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));

        // If retry-after exceeds our max wait, or this is our last attempt, give up
        if (retryAfter > MAX_RETRY_WAIT || attempt === MAX_RETRIES) {
          const errorBody = await response.text();
          return {
            success: false,
            quotaExhausted: true,
            error: `Resend 429: ${errorBody} (retry-after: ${retryAfter}s)`
          };
        }

        console.log(
          `Resend rate limited (attempt ${attempt + 1}/${MAX_RETRIES + 1}), waiting ${retryAfter}s`
        );
        await sleep(retryAfter * 1000);
        continue;
      }

      // Any other error is permanent — don't retry
      const errorBody = await response.text();
      return {
        success: false,
        quotaExhausted: false,
        error: `Resend ${response.status}: ${errorBody}`
      };
    } catch (err) {
      lastError = err.message;
      // Network errors on last attempt are permanent failures
      if (attempt === MAX_RETRIES) {
        break;
      }
    }
  }

  return {
    success: false,
    quotaExhausted: false,
    error: `Resend request failed after ${MAX_RETRIES + 1} attempts: ${lastError}`
  };
}

/**
 * Parse the retry-after header value.
 * Can be seconds (integer) or an HTTP date.
 * @param {string|null} value
 * @returns {number} Seconds to wait (defaults to 1 if unparseable)
 */
function parseRetryAfter(value) {
  if (!value) {
    return 1;
  }

  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) {
    return Math.max(1, seconds);
  }

  // Try HTTP-date format
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const diff = Math.ceil((date.getTime() - Date.now()) / 1000);
    return Math.max(1, diff);
  }

  return 1;
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
