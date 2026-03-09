/**
 * feedmail Admin Worker — serves /admin/* routes.
 * Passwordless authentication via magic link emails and passkeys (WebAuthn).
 * Server-rendered admin console for channel, feed, subscriber, and settings management.
 */

import { getRateLimitConfig } from "../shared/lib/config.js";
import { checkRateLimit, getEndpointName } from "../shared/lib/rate-limit.js";
import {
  handleLogin,
  handleLoginSubmit,
  handleAdminVerify,
  handleLogout
} from "./routes/auth.js";
import {
  handleRegisterOptions,
  handleRegisterVerify,
  handleAuthenticateOptions,
  handleAuthenticateVerify,
  handlePasskeyRename,
  handlePasskeyDelete
} from "./routes/passkeys.js";
import { handleDashboard, handleSend } from "./routes/dashboard.js";
import {
  handleChannelList,
  handleChannelNew,
  handleChannelCreate,
  handleChannelDetail,
  handleChannelUpdate,
  handleChannelDelete
} from "./routes/channels.js";
import {
  handleFeedNew,
  handleFeedCreate,
  handleFeedEdit,
  handleFeedUpdate,
  handleFeedDelete
} from "./routes/feeds.js";
import { handleSubscriberList } from "./routes/subscribers.js";
import { handleSettings } from "./routes/settings.js";
import { requireSession } from "./lib/session.js";

/** Routes exempt from session middleware. */
const PUBLIC_ROUTES = new Set([
  "/admin/login",
  "/admin/verify",
  "/admin/logout",
  "/admin/passkeys/authenticate/options",
  "/admin/passkeys/authenticate/verify"
]);

export default {
  /**
   * HTTP request handler.
   * @param {Request} request
   * @param {object} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    // Trailing-slash normalization (before rate limiting, session checks, routing)
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
      if (request.method === "GET") {
        return new Response(null, {
          status: 301,
          headers: { Location: url.pathname + url.search }
        });
      }
    }

    try {
      // Rate limiting on auth endpoints
      const endpointName = getEndpointName(url.pathname);
      if (endpointName && env.DB) {
        const rateLimitMap = await getRateLimitConfig(env);
        const limits = rateLimitMap[endpointName];
        if (limits) {
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          const result = await checkRateLimit(
            env.DB,
            ip,
            endpointName,
            limits.maxRequests,
            limits.windowSeconds
          );
          if (!result.allowed) {
            return new Response(
              JSON.stringify({ error: "Too Many Requests" }),
              {
                status: 429,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": String(result.retryAfter)
                }
              }
            );
          }
        }
      }

      // Session middleware for protected routes
      if (!PUBLIC_ROUTES.has(url.pathname)) {
        const { response } = await requireSession(request, env);
        if (response) {
          return response;
        }
        // Session is valid — continue to route handler
      }

      // Route matching

      // ─── Auth routes ──────────────────────────────────────────────────
      if (url.pathname === "/admin/login") {
        if (request.method === "GET") {
          return await handleLogin(request, env);
        }
        if (request.method === "POST") {
          return await handleLoginSubmit(request, env);
        }
        return new Response(null, { status: 405 });
      }

      if (url.pathname === "/admin/verify") {
        if (request.method === "GET") {
          return await handleAdminVerify(request, env);
        }
        return new Response(null, { status: 405 });
      }

      if (url.pathname === "/admin/logout") {
        if (request.method === "GET") {
          return await handleLogout(request, env);
        }
        return new Response(null, { status: 405 });
      }

      // ─── Passkey authentication routes (public) ───────────────────────
      if (url.pathname === "/admin/passkeys/authenticate/options") {
        if (request.method === "POST") {
          return await handleAuthenticateOptions(request, env);
        }
        return new Response(null, { status: 405 });
      }

      if (url.pathname === "/admin/passkeys/authenticate/verify") {
        if (request.method === "POST") {
          return await handleAuthenticateVerify(request, env);
        }
        return new Response(null, { status: 405 });
      }

      // ─── Passkey management routes (protected) ────────────────────────
      if (url.pathname === "/admin/passkeys") {
        if (request.method === "GET") {
          // Redirect to settings page
          return Response.redirect(
            `https://${env.DOMAIN}/admin/settings`,
            302
          );
        }
        return new Response(null, { status: 405 });
      }

      if (url.pathname === "/admin/passkeys/register/options") {
        if (request.method === "POST") {
          return await handleRegisterOptions(request, env);
        }
        return new Response(null, { status: 405 });
      }

      if (url.pathname === "/admin/passkeys/register/verify") {
        if (request.method === "POST") {
          return await handleRegisterVerify(request, env);
        }
        return new Response(null, { status: 405 });
      }

      // Dynamic passkey routes: /admin/passkeys/{credentialId}/rename or /delete
      const passkeyActionMatch = url.pathname.match(
        /^\/admin\/passkeys\/([^/]+)\/(rename|delete)$/
      );
      if (passkeyActionMatch) {
        const credentialId = decodeURIComponent(passkeyActionMatch[1]);
        const action = passkeyActionMatch[2];
        if (request.method === "POST") {
          if (action === "rename") {
            return await handlePasskeyRename(request, env, credentialId);
          }
          if (action === "delete") {
            return await handlePasskeyDelete(request, env, credentialId);
          }
        }
        return new Response(null, { status: 405 });
      }

      // ─── Dashboard ───────────────────────────────────────────────────
      if (url.pathname === "/admin") {
        if (request.method === "GET") {
          return await handleDashboard(request, env);
        }
        return new Response(null, { status: 405 });
      }

      // ─── Send trigger ────────────────────────────────────────────────
      if (url.pathname === "/admin/send") {
        if (request.method === "POST") {
          return await handleSend(request, env);
        }
        return new Response(null, { status: 405 });
      }

      // ─── Settings ────────────────────────────────────────────────────
      if (url.pathname === "/admin/settings") {
        if (request.method === "GET") {
          return await handleSettings(request, env);
        }
        return new Response(null, { status: 405 });
      }

      // ─── Subscribers ─────────────────────────────────────────────────
      if (url.pathname === "/admin/subscribers") {
        if (request.method === "GET") {
          return await handleSubscriberList(request, env);
        }
        return new Response(null, { status: 405 });
      }

      // ─── Channel routes ──────────────────────────────────────────────
      if (url.pathname === "/admin/channels") {
        if (request.method === "GET") {
          return await handleChannelList(request, env);
        }
        if (request.method === "POST") {
          return await handleChannelCreate(request, env);
        }
        return new Response(null, { status: 405 });
      }

      if (url.pathname === "/admin/channels/new") {
        if (request.method === "GET") {
          return await handleChannelNew(request, env);
        }
        return new Response(null, { status: 405 });
      }

      // Channel delete: /admin/channels/{id}/delete
      const channelDeleteMatch = url.pathname.match(
        /^\/admin\/channels\/([^/]+)\/delete$/
      );
      if (channelDeleteMatch) {
        const channelId = decodeURIComponent(channelDeleteMatch[1]);
        if (request.method === "POST") {
          return await handleChannelDelete(request, env, channelId);
        }
        return new Response(null, { status: 405 });
      }

      // Feed routes: /admin/channels/{id}/feeds/...
      const feedNewMatch = url.pathname.match(
        /^\/admin\/channels\/([^/]+)\/feeds\/new$/
      );
      if (feedNewMatch) {
        const channelId = decodeURIComponent(feedNewMatch[1]);
        if (request.method === "GET") {
          return await handleFeedNew(request, env, channelId);
        }
        return new Response(null, { status: 405 });
      }

      const feedDeleteMatch = url.pathname.match(
        /^\/admin\/channels\/([^/]+)\/feeds\/(\d+)\/delete$/
      );
      if (feedDeleteMatch) {
        const channelId = decodeURIComponent(feedDeleteMatch[1]);
        const feedId = feedDeleteMatch[2];
        if (request.method === "POST") {
          return await handleFeedDelete(request, env, channelId, feedId);
        }
        return new Response(null, { status: 405 });
      }

      const feedEditMatch = url.pathname.match(
        /^\/admin\/channels\/([^/]+)\/feeds\/(\d+)\/edit$/
      );
      if (feedEditMatch) {
        const channelId = decodeURIComponent(feedEditMatch[1]);
        const feedId = feedEditMatch[2];
        if (request.method === "GET") {
          return await handleFeedEdit(request, env, channelId, feedId);
        }
        return new Response(null, { status: 405 });
      }

      const feedActionMatch = url.pathname.match(
        /^\/admin\/channels\/([^/]+)\/feeds(?:\/(\d+))?$/
      );
      if (feedActionMatch) {
        const channelId = decodeURIComponent(feedActionMatch[1]);
        const feedId = feedActionMatch[2] || null;
        if (!feedId) {
          // POST /admin/channels/{id}/feeds — create feed
          if (request.method === "POST") {
            return await handleFeedCreate(request, env, channelId);
          }
          return new Response(null, { status: 405 });
        }
        // POST /admin/channels/{id}/feeds/{feedId} — update feed
        if (request.method === "POST") {
          return await handleFeedUpdate(request, env, channelId, feedId);
        }
        return new Response(null, { status: 405 });
      }

      // Channel detail/edit: /admin/channels/{id}
      const channelDetailMatch = url.pathname.match(
        /^\/admin\/channels\/([^/]+)$/
      );
      if (channelDetailMatch) {
        const channelId = decodeURIComponent(channelDetailMatch[1]);
        if (request.method === "GET") {
          return await handleChannelDetail(request, env, channelId);
        }
        if (request.method === "POST") {
          return await handleChannelUpdate(request, env, channelId);
        }
        return new Response(null, { status: 405 });
      }

      // Unknown path
      return new Response(null, { status: 404 });
    } catch (err) {
      console.error("Admin Worker error:", err);
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" }
      });
    }
  }
};
