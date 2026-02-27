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

export default {
  /**
   * HTTP request handler.
   * @param {Request} request
   * @param {object} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORSPreflight(request, env);
    }

    try {
      // Public API routes
      if (url.pathname === "/api/subscribe" && request.method === "POST") {
        const response = await handleSubscribe(request, env);
        return withCORS(response, request, env);
      }

      if (url.pathname === "/api/verify" && request.method === "GET") {
        return handleVerify(request, env, url);
      }

      if (url.pathname === "/api/unsubscribe") {
        return handleUnsubscribe(request, env, url);
      }

      // Authenticated routes
      if (url.pathname === "/api/send" && request.method === "POST") {
        if (!isAuthorized(request, env)) return unauthorizedResponse();
        return handleSend(request, env);
      }

      if (url.pathname.startsWith("/api/admin/")) {
        if (!isAuthorized(request, env)) return unauthorizedResponse();
        return handleAdmin(request, env, url);
      }

      // Not found
      return new Response("Not Found", { status: 404 });
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
