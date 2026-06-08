/**
 * Admin-console request/response security middleware.
 *
 * Applied at the Admin Worker choke point (worker.js) so every response — full
 * pages, HTMX fragments, JSON, redirects, errors — carries the same headers.
 *
 * The CSP uses a strict `script-src 'self'`: all admin JS is served as static
 * assets under /admin/*.js (no inline scripts, nonces, or 'unsafe-inline').
 * `style-src 'self'` holds because the only would-be inline styles came from
 * HTMX's injected indicator <style>, which is disabled via the htmx-config
 * meta tag (admin-head.hbs) — the indicator styles live in styles.css.
 */

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'"
].join("; ");

/** Security headers applied to every admin response. */
export const ADMIN_SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin"
};

/**
 * Return a copy of `response` with the admin security headers applied.
 * Rebuilds the Response because headers on some responses (e.g. those from
 * Response.redirect) are immutable.
 * @param {Response} response
 * @returns {Response}
 */
export function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(ADMIN_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
