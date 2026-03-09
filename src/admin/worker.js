/**
 * feedmail Admin Worker — serves /admin/* routes.
 * Passwordless authentication via magic link emails and passkeys (WebAuthn).
 */

import { getRateLimitConfig } from "../shared/lib/config.js";
import { checkRateLimit, getEndpointName } from "../shared/lib/rate-limit.js";
import { render } from "../shared/lib/templates.js";
import { htmlResponse } from "../shared/lib/response.js";
import { getCredential } from "../shared/lib/db.js";
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
  handlePasskeyManagement,
  handlePasskeyRename,
  handlePasskeyDelete
} from "./routes/passkeys.js";
import { requireSession } from "./lib/session.js";
import { getPasskeyCredentialCount } from "./lib/db.js";

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

      // Passkey authentication routes (public)
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

      // Passkey management routes (protected)
      if (url.pathname === "/admin/passkeys") {
        if (request.method === "GET") {
          return await handlePasskeyManagement(request, env);
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

      // Protected admin dashboard (placeholder)
      if (url.pathname === "/admin") {
        if (request.method === "GET") {
          // Check if admin email is configured
          const adminEmail = await getCredential(env.DB, "admin_email");
          if (!adminEmail) {
            const html = render("adminPlaceholder", {
              setupError:
                "Admin email not configured. Run the setup script to complete installation."
            });
            return htmlResponse(html);
          }

          // Check for passkey bootstrap prompt
          const passkeyCount = await getPasskeyCredentialCount(env.DB);
          const dismissed = url.searchParams.get("dismissed") === "passkey";
          const showPasskeyPrompt = passkeyCount === 0 && !dismissed;

          const html = render("adminPlaceholder", { showPasskeyPrompt });
          return htmlResponse(html);
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
