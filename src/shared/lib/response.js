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
