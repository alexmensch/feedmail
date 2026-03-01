/**
 * feedmail — RSS-to-email microservice for Cloudflare Workers.
 * Main router and scheduled (cron) handler.
 */

import { handleSubscribe } from "./routes/subscribe.js";
import { handleVerify } from "./routes/verify.js";
import { handleUnsubscribe } from "./routes/unsubscribe.js";
import { handleSend, checkFeedsAndSend } from "./routes/send.js";
import { handleAdmin } from "./routes/admin.js";
import { handleCORSPreflight, withCORS } from "./lib/cors.js";
import {
  checkRateLimit,
  getEndpointName,
  RATE_LIMITS,
} from "./lib/rate-limit.js";

/**
 * Allowed HTTP methods per route path.
 * Every routable path must be listed here explicitly.
 */
const ROUTE_METHODS = {
  "/api/subscribe": ["POST"],
  "/api/verify": ["GET"],
  "/api/unsubscribe": ["GET", "POST"],
  "/api/send": ["POST"],
  "/api/admin/stats": ["GET"],
  "/api/admin/subscribers": ["GET"],
};

/** Delay duration (ms) for timeout responses on invalid method/path. */
const TIMEOUT_DELAY_MS = 10_000;

/**
 * Validate the Authorization header against the ADMIN_API_KEY.
 * @param {Request} request
 * @param {object} env
 * @returns {boolean}
 */
function isAuthorized(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  return token === env.ADMIN_API_KEY;
}

/**
 * Return a 401 Unauthorized JSON response.
 * @returns {Response}
 */
function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Delay then return a 408 Request Timeout with no body.
 * Discourages bots probing unsupported methods on known routes.
 * @returns {Promise<Response>}
 */
async function timeoutResponse() {
  await new Promise((resolve) => setTimeout(resolve, TIMEOUT_DELAY_MS));
  return new Response(null, { status: 408 });
}

/**
 * Check if the given method is allowed for the given pathname.
 * @param {string} method
 * @param {string} pathname
 * @returns {boolean|null} true = allowed, false = wrong method, null = unknown path
 */
function isMethodAllowed(method, pathname) {
  const methods = ROUTE_METHODS[pathname];
  if (!methods) return null;
  return methods.includes(method);
}

export default {
  /**
   * HTTP request handler.
   * @param {Request} request
   * @param {object} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight always handled immediately
    if (request.method === "OPTIONS") {
      return handleCORSPreflight(request, env);
    }

    // Method enforcement: unknown paths get immediate 404, wrong methods get timeout
    const methodCheck = isMethodAllowed(request.method, url.pathname);
    if (methodCheck === null) {
      return new Response(null, { status: 404 });
    }
    if (methodCheck === false) {
      return timeoutResponse();
    }

    // IP-based rate limiting (before authentication to protect against brute-force)
    const endpointName = getEndpointName(url.pathname);
    if (endpointName && env.DB) {
      const limits = RATE_LIMITS[endpointName];
      if (limits) {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const result = await checkRateLimit(
          env.DB,
          ip,
          endpointName,
          limits.maxRequests,
          limits.windowSeconds,
        );
        if (!result.allowed) {
          return new Response(
            JSON.stringify({ error: "Too Many Requests" }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": String(result.retryAfter),
              },
            },
          );
        }
      }
    }

    try {
      // Public API routes
      if (url.pathname === "/api/subscribe") {
        const response = await handleSubscribe(request, env);
        return withCORS(response, request, env);
      }

      if (url.pathname === "/api/verify") {
        return handleVerify(request, env, url);
      }

      if (url.pathname === "/api/unsubscribe") {
        return handleUnsubscribe(request, env, url);
      }

      // Authenticated routes
      if (url.pathname === "/api/send") {
        if (!isAuthorized(request, env)) return unauthorizedResponse();
        return handleSend(request, env);
      }

      if (url.pathname.startsWith("/api/admin/")) {
        if (!isAuthorized(request, env)) return unauthorizedResponse();
        return handleAdmin(request, env, url);
      }

      // Safety fallback (should not be reached if ROUTE_METHODS is in sync)
      return new Response(null, { status: 404 });
    } catch (err) {
      console.error("Unhandled error:", err);
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  /**
   * Cron trigger handler — check feeds and send emails.
   * @param {ScheduledEvent} event
   * @param {object} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkFeedsAndSend(env));
  },
};
