/**
 * Email sending via Resend REST API.
 * https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Send an email via Resend.
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
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendEmail(
  apiKey,
  { from, fromName, replyTo, to, subject, html, text, headers },
) {
  const payload = {
    from: fromName ? `${fromName} <${from}>` : from,
    to,
    reply_to: replyTo || from,
    subject,
    html,
    text,
  };

  if (headers && Object.keys(headers).length > 0) {
    payload.headers = headers;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { success: true };
    }

    const errorBody = await response.text();
    return {
      success: false,
      error: `Resend ${response.status}: ${errorBody}`,
    };
  } catch (err) {
    return { success: false, error: `Resend request failed: ${err.message}` };
  }
}
