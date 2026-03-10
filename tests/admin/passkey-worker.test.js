import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock route handlers
vi.mock("../../src/admin/routes/auth.js", () => ({
  handleLogin: vi.fn(),
  handleLoginSubmit: vi.fn(),
  handleAdminVerify: vi.fn(),
  handleLogout: vi.fn()
}));
vi.mock("../../src/admin/routes/passkeys.js", () => ({
  handleRegisterOptions: vi.fn(),
  handleRegisterVerify: vi.fn(),
  handleAuthenticateOptions: vi.fn(),
  handleAuthenticateVerify: vi.fn(),
  handlePasskeyRename: vi.fn(),
  handlePasskeyDelete: vi.fn()
}));
vi.mock("../../src/admin/routes/dashboard.js", () => ({
  handleDashboard: vi.fn(),
  handleSendTrigger: vi.fn()
}));
vi.mock("../../src/admin/routes/channels.js", () => ({
  handleChannelList: vi.fn(),
  handleChannelNew: vi.fn(),
  handleChannelCreate: vi.fn(),
  handleChannelDetail: vi.fn(),
  handleChannelUpdate: vi.fn(),
  handleChannelDelete: vi.fn()
}));
vi.mock("../../src/admin/routes/subscribers.js", () => ({
  handleSubscriberList: vi.fn()
}));
vi.mock("../../src/admin/routes/settings.js", () => ({
  handleSettings: vi.fn()
}));
// Mock session middleware
vi.mock("../../src/admin/lib/session.js", () => ({
  requireSession: vi.fn(),
  getSessionFromCookie: vi.fn(),
  getCookieValue: vi.fn(),
  SESSION_COOKIE_NAME: "feedmail_admin_session",
  SESSION_TTL_SECONDS: 86400
}));
// Mock admin db
vi.mock("../../src/admin/lib/db.js", () => ({
  getPasskeyCredentialCount: vi.fn(),
  createMagicLinkToken: vi.fn(),
  getMagicLinkToken: vi.fn(),
  markMagicLinkTokenUsed: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  MAGIC_LINK_TTL_SECONDS: 900
}));
// Mock shared config for rate limiting
vi.mock("../../src/shared/lib/config.js", () => ({
  getRateLimitConfig: vi.fn()
}));
// Mock shared rate-limit
vi.mock("../../src/shared/lib/rate-limit.js", () => ({
  checkRateLimit: vi.fn(),
  getEndpointName: vi.fn()
}));
// Mock templates
vi.mock("../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>mock</html>")
}));
// Mock shared response helpers
vi.mock("../../src/shared/lib/response.js", () => ({
  htmlResponse: vi.fn().mockImplementation(
    (html, status = 200) =>
      new Response(html, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  ),
  rateLimitResponse: vi.fn().mockImplementation(
    (retryAfter) =>
      new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter)
        }
      })
  )
}));
// Mock shared db
vi.mock("../../src/shared/lib/db.js", () => ({
  getCredential: vi.fn()
}));

import adminApp from "../../src/admin/worker.js";
import {
  handleLogin,
  handleLoginSubmit,
  handleAdminVerify,
  handleLogout
} from "../../src/admin/routes/auth.js";
import {
  handleRegisterOptions,
  handleRegisterVerify,
  handleAuthenticateOptions,
  handleAuthenticateVerify,
  handlePasskeyRename,
  handlePasskeyDelete
} from "../../src/admin/routes/passkeys.js";
import { requireSession } from "../../src/admin/lib/session.js";
import { getPasskeyCredentialCount } from "../../src/admin/lib/db.js";
import { getRateLimitConfig } from "../../src/shared/lib/config.js";
import {
  checkRateLimit,
  getEndpointName
} from "../../src/shared/lib/rate-limit.js";
import { getCredential } from "../../src/shared/lib/db.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

function makeRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(`https://feedmail.example.com${path}`, {
    method,
    headers: reqHeaders
  });
}

describe("admin worker — passkey routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const okResponse = new Response("<html>OK</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
    const jsonResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: "/admin/passkeys" }
    });

    handleLogin.mockResolvedValue(okResponse);
    handleLoginSubmit.mockResolvedValue(okResponse);
    handleAdminVerify.mockResolvedValue(okResponse);
    handleLogout.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/admin/login" }
      })
    );
    handleRegisterOptions.mockResolvedValue(jsonResponse);
    handleRegisterVerify.mockResolvedValue(jsonResponse);
    handleAuthenticateOptions.mockResolvedValue(jsonResponse);
    handleAuthenticateVerify.mockResolvedValue(jsonResponse);
    handlePasskeyRename.mockResolvedValue(redirectResponse);
    handlePasskeyDelete.mockResolvedValue(redirectResponse);

    // Session middleware: response null means allow through
    requireSession.mockResolvedValue({
      session: { id: 1, token: "test-session" },
      response: null
    });

    // Rate limiting defaults: allow all requests
    getRateLimitConfig.mockResolvedValue({
      admin_login: { maxRequests: 10, windowSeconds: 3600 }
    });
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockImplementation((pathname) => {
      if (pathname === "/admin/login") {
        return "admin_login";
      }
      if (pathname === "/admin/verify") {
        return "admin_verify";
      }
      if (
        pathname === "/admin/passkeys/authenticate/options" ||
        pathname === "/admin/passkeys/authenticate/verify"
      ) {
        return "admin_login";
      }
      return null;
    });

    getCredential.mockResolvedValue("admin@example.com");
    getPasskeyCredentialCount.mockResolvedValue(0);
  });

  // ─── Registration Routes (Protected) ─────────────────────────────────

  describe("passkey registration routes (require session)", () => {
    it("routes POST /admin/passkeys/register/options to handleRegisterOptions", async () => {
      const request = makeRequest("POST", "/admin/passkeys/register/options");

      await adminApp.fetch(request, env);

      expect(handleRegisterOptions).toHaveBeenCalledWith(request, env);
    });

    it("routes POST /admin/passkeys/register/verify to handleRegisterVerify", async () => {
      const request = makeRequest("POST", "/admin/passkeys/register/verify");

      await adminApp.fetch(request, env);

      expect(handleRegisterVerify).toHaveBeenCalledWith(request, env);
    });

    it("applies session middleware to registration options endpoint", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("POST", "/admin/passkeys/register/options");

      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalledWith(request, env);
      expect(response.status).toBe(302);
      expect(handleRegisterOptions).not.toHaveBeenCalled();
    });

    it("applies session middleware to registration verify endpoint", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("POST", "/admin/passkeys/register/verify");

      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalledWith(request, env);
      expect(response.status).toBe(302);
      expect(handleRegisterVerify).not.toHaveBeenCalled();
    });

    it("returns 405 for GET /admin/passkeys/register/options", async () => {
      const request = makeRequest("GET", "/admin/passkeys/register/options");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it("returns 405 for GET /admin/passkeys/register/verify", async () => {
      const request = makeRequest("GET", "/admin/passkeys/register/verify");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  // ─── Authentication Routes (Public) ───────────────────────────────────

  describe("passkey authentication routes (public, rate-limited)", () => {
    it("routes POST /admin/passkeys/authenticate/options to handleAuthenticateOptions", async () => {
      const request = makeRequest(
        "POST",
        "/admin/passkeys/authenticate/options"
      );

      await adminApp.fetch(request, env);

      expect(handleAuthenticateOptions).toHaveBeenCalledWith(request, env);
    });

    it("routes POST /admin/passkeys/authenticate/verify to handleAuthenticateVerify", async () => {
      const request = makeRequest(
        "POST",
        "/admin/passkeys/authenticate/verify"
      );

      await adminApp.fetch(request, env);

      expect(handleAuthenticateVerify).toHaveBeenCalledWith(request, env);
    });

    it("does NOT apply session middleware to authenticate/options", async () => {
      const request = makeRequest(
        "POST",
        "/admin/passkeys/authenticate/options"
      );

      await adminApp.fetch(request, env);

      expect(handleAuthenticateOptions).toHaveBeenCalled();
    });

    it("does NOT apply session middleware to authenticate/verify", async () => {
      const request = makeRequest(
        "POST",
        "/admin/passkeys/authenticate/verify"
      );

      await adminApp.fetch(request, env);

      expect(handleAuthenticateVerify).toHaveBeenCalled();
    });

    it("rate limits authenticate/options endpoint", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });
      getEndpointName.mockReturnValue("admin_login");

      const request = makeRequest(
        "POST",
        "/admin/passkeys/authenticate/options",
        { "CF-Connecting-IP": "1.2.3.4" }
      );

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(429);
      expect(handleAuthenticateOptions).not.toHaveBeenCalled();
    });

    it("rate limits authenticate/verify endpoint", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 120 });
      getEndpointName.mockReturnValue("admin_login");

      const request = makeRequest(
        "POST",
        "/admin/passkeys/authenticate/verify",
        { "CF-Connecting-IP": "1.2.3.4" }
      );

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(429);
      expect(handleAuthenticateVerify).not.toHaveBeenCalled();
    });

    it("returns 405 for GET /admin/passkeys/authenticate/options", async () => {
      const request = makeRequest(
        "GET",
        "/admin/passkeys/authenticate/options"
      );

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it("returns 405 for GET /admin/passkeys/authenticate/verify", async () => {
      const request = makeRequest("GET", "/admin/passkeys/authenticate/verify");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  // ─── Management Route (Protected) ────────────────────────────────────

  describe("passkey management route (require session)", () => {
    it("redirects GET /admin/passkeys to /admin/settings", async () => {
      const request = makeRequest("GET", "/admin/passkeys");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "https://feedmail.example.com/admin/settings"
      );
    });

    it("applies session middleware to /admin/passkeys", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("GET", "/admin/passkeys");

      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalledWith(request, env);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/admin/login");
    });

    it("returns 405 for non-GET methods on /admin/passkeys", async () => {
      const request = makeRequest("DELETE", "/admin/passkeys");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  // ─── Rename and Delete Routes (Protected) ─────────────────────────────

  describe("passkey rename and delete routes (require session)", () => {
    it("routes POST /admin/passkeys/{credentialId}/rename to handlePasskeyRename", async () => {
      const request = makeRequest("POST", "/admin/passkeys/cred-123/rename");

      await adminApp.fetch(request, env);

      expect(handlePasskeyRename).toHaveBeenCalledWith(
        request,
        env,
        "cred-123"
      );
    });

    it("routes POST /admin/passkeys/{credentialId}/delete to handlePasskeyDelete", async () => {
      const request = makeRequest("POST", "/admin/passkeys/cred-123/delete");

      await adminApp.fetch(request, env);

      expect(handlePasskeyDelete).toHaveBeenCalledWith(
        request,
        env,
        "cred-123"
      );
    });

    it("applies session middleware to rename endpoint", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("POST", "/admin/passkeys/cred-123/rename");

      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalledWith(request, env);
      expect(response.status).toBe(302);
      expect(handlePasskeyRename).not.toHaveBeenCalled();
    });

    it("applies session middleware to delete endpoint", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("POST", "/admin/passkeys/cred-123/delete");

      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalledWith(request, env);
      expect(response.status).toBe(302);
      expect(handlePasskeyDelete).not.toHaveBeenCalled();
    });

    it("returns 405 for GET /admin/passkeys/{credentialId}/rename", async () => {
      const request = makeRequest("GET", "/admin/passkeys/cred-123/rename");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it("returns 405 for GET /admin/passkeys/{credentialId}/delete", async () => {
      const request = makeRequest("GET", "/admin/passkeys/cred-123/delete");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  // ─── Rate Limit Endpoint Name Mapping ─────────────────────────────────

  describe("rate limit endpoint name mapping for passkey auth routes", () => {
    it("maps /admin/passkeys/authenticate/options to a rate limit endpoint", async () => {
      const request = makeRequest(
        "POST",
        "/admin/passkeys/authenticate/options",
        { "CF-Connecting-IP": "1.2.3.4" }
      );

      await adminApp.fetch(request, env);

      expect(getEndpointName).toHaveBeenCalledWith(
        "/admin/passkeys/authenticate/options"
      );
    });

    it("maps /admin/passkeys/authenticate/verify to a rate limit endpoint", async () => {
      const request = makeRequest(
        "POST",
        "/admin/passkeys/authenticate/verify",
        { "CF-Connecting-IP": "1.2.3.4" }
      );

      await adminApp.fetch(request, env);

      expect(getEndpointName).toHaveBeenCalledWith(
        "/admin/passkeys/authenticate/verify"
      );
    });
  });
});
