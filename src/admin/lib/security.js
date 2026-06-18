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

/** HTTP methods that mutate state and require a same-origin (CSRF) check. */
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Whether the request uses a state-changing method.
 * @param {Request} request
 * @returns {boolean}
 */
export function isStateChangingMethod(request) {
  return STATE_CHANGING_METHODS.has(request.method);
}

/**
 * CSRF defense-in-depth: verify a request comes from the admin console's own
 * origin. Complements the session cookie's SameSite=Strict by also blocking
 * same-site (sibling-subdomain) and legacy-browser cross-site requests that
 * SameSite does not stop.
 *
 * Prefers the Origin header (exact match against `https://{DOMAIN}`); falls
 * back to a Referer prefix match for the rare browser that omits Origin on a
 * same-origin POST. Fails closed when neither header is present.
 * @param {Request} request
 * @param {object} env - must provide env.DOMAIN
 * @returns {boolean}
 */
export function isSameOriginRequest(request, env) {
  const expectedOrigin = `https://${env.DOMAIN}`;
  const origin = request.headers.get("Origin");
  if (origin !== null) {
    return origin === expectedOrigin;
  }
  const referer = request.headers.get("Referer");
  if (referer) {
    return (
      referer === expectedOrigin || referer.startsWith(`${expectedOrigin}/`)
    );
  }
  return false;
}
