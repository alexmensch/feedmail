/**
 * HTMX request detection and fragment response helpers.
 */

/**
 * Check if the request is an HTMX request (has HX-Request header).
 * @param {Request} request
 * @returns {boolean}
 */
export function isHtmxRequest(request) {
  const value = request.headers.get("HX-Request");
  return value === "true";
}

/**
 * Create an HTML fragment response for HTMX swaps.
 * @param {string} html - HTML fragment content
 * @param {number} [status=200] - HTTP status code
 * @param {object} [headers={}] - Additional headers
 * @returns {Response}
 */
export function fragmentResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...headers
    }
  });
}
