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
