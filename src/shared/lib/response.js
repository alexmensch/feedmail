/**
 * Shared HTTP response helpers.
 */

/**
 * Create a JSON response.
 * @param {number} status - HTTP status code
 * @param {object} body - Response body (will be JSON-stringified)
 * @returns {Response}
 */
export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Create a 429 Too Many Requests JSON response with Retry-After header.
 * @param {number} retryAfter - Seconds until the client should retry
 * @returns {Response}
 */
export function rateLimitResponse(retryAfter) {
  return new Response(JSON.stringify({ error: "Too Many Requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter)
    }
  });
}

/**
 * Create an HTML response.
 * @param {string} html - HTML content
 * @param {number} [status=200] - HTTP status code
 * @returns {Response}
 */
export function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
