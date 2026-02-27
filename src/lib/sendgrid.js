/**
 * SendGrid v3 API helper for sending emails.
 */

const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

/**
 * Send an email via SendGrid.
 * @param {string} apiKey - SendGrid API key
 * @param {object} options
 * @param {string} options.from - Sender email
 * @param {string} options.fromName - Sender display name
 * @param {string} [options.replyTo] - Reply-to email (defaults to from)
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content
 * @param {object} [options.headers] - Additional email headers
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendEmail(
  apiKey,
  { from, fromName, replyTo, to, subject, html, text, headers },
) {
  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: fromName },
    reply_to: { email: replyTo || from },
    subject,
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html },
    ],
  };

  if (headers && Object.keys(headers).length > 0) {
    payload.headers = headers;
  }

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // SendGrid returns 202 on success
    if (response.status === 202 || response.status === 200) {
      return { success: true };
    }

    const errorText = await response.text();
    return {
      success: false,
      error: `SendGrid ${response.status}: ${errorText}`,
    };
  } catch (err) {
    return { success: false, error: `SendGrid request failed: ${err.message}` };
  }
}
