/**
 * Admin session management: cookie handling and session middleware.
 */

import { getSession } from "./db.js";
import { isHtmxRequest } from "./htmx.js";
import { render } from "../../shared/lib/templates.js";

/** Cookie name for admin sessions. */
export const SESSION_COOKIE_NAME = "feedmail_admin_session";

/** Session TTL in seconds (24 hours). */
export const SESSION_TTL_SECONDS = 86400;

/**
 * Parse a named cookie value from the request's Cookie header.
 * @param {Request} request
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null
 */
export function getCookieValue(request, name) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1);
    }
  }
  return null;
}

/**
 * Parse the session token from the request's Cookie header.
 * @param {Request} request
 * @returns {string|null} Session token or null
 */
export function getSessionFromCookie(request) {
  return getCookieValue(request, SESSION_COOKIE_NAME);
}

/**
 * Build a Set-Cookie header value for setting the session cookie.
 * @param {string} token - Session token
 * @returns {string}
 */
export function createSessionCookie(token) {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${SESSION_TTL_SECONDS}`;
}

/**
 * Build a Set-Cookie header value for clearing the session cookie.
 * @returns {string}
 */
export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0`;
}

/**
 * Session middleware: validates the session cookie against D1.
 * Returns the session object if valid, or a redirect Response if not.
 * For HTMX requests with expired sessions, returns a session-expired fragment
 * instead of a redirect.
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<{ session: object|null, response: Response|null }>}
 */
export async function requireSession(request, env) {
  const token = getSessionFromCookie(request);

  if (!token) {
    return { session: null, response: sessionExpiredResponse(request) };
  }

  const session = await getSession(env.DB, token);

  if (!session) {
    return { session: null, response: sessionExpiredResponse(request) };
  }

  // Check expiry
  const expiresAt = new Date(`${session.expires_at}Z`);
  if (expiresAt <= new Date()) {
    return { session: null, response: sessionExpiredResponse(request) };
  }

  return { session, response: null };
}

/**
 * Build the appropriate response for an expired/missing session.
 * HTMX requests get a session-expired fragment; standard requests get a redirect.
 * @param {Request} request
 * @returns {Response}
 */
function sessionExpiredResponse(request) {
  if (isHtmxRequest(request)) {
    const html = render("adminSessionExpired", {});
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  return redirectToLogin(request);
}

/**
 * Build a redirect response to the login page, preserving the original path.
 * @param {Request} request
 * @returns {Response}
 */
function redirectToLogin(request) {
  const url = new URL(request.url);
  const redirectPath = url.pathname + url.search;

  // Validate redirect starts with /admin to prevent open redirect
  const redirect = redirectPath.startsWith("/admin") ? redirectPath : "/admin";

  return Response.redirect(
    `${url.origin}/admin/login?redirect=${encodeURIComponent(redirect)}`,
    302
  );
}
