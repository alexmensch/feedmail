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
vi.mock("../../src/admin/routes/feeds.js", () => ({
  handleFeedNew: vi.fn(),
  handleFeedCreate: vi.fn(),
  handleFeedEdit: vi.fn(),
  handleFeedUpdate: vi.fn(),
  handleFeedDelete: vi.fn()
}));
vi.mock("../../src/admin/routes/subscribers.js", () => ({
  handleSubscriberList: vi.fn()
}));
vi.mock("../../src/admin/routes/settings.js", () => ({
  handleSettings: vi.fn()
}));
// Mock admin db
vi.mock("../../src/admin/lib/db.js", () => ({
  getPasskeyCredentialCount: vi.fn().mockResolvedValue(0),
  createMagicLinkToken: vi.fn(),
  getMagicLinkToken: vi.fn(),
  markMagicLinkTokenUsed: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  MAGIC_LINK_TTL_SECONDS: 900
}));
// Mock session middleware
vi.mock("../../src/admin/lib/session.js", () => ({
  requireSession: vi.fn(),
  getSessionFromCookie: vi.fn(),
  SESSION_COOKIE_NAME: "feedmail_admin_session",
  SESSION_TTL_SECONDS: 86400
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
import { requireSession } from "../../src/admin/lib/session.js";
import { getRateLimitConfig } from "../../src/shared/lib/config.js";
import {
  checkRateLimit,
  getEndpointName
} from "../../src/shared/lib/rate-limit.js";
import { handleDashboard } from "../../src/admin/routes/dashboard.js";

const RATE_LIMITS = {
  admin_login: { maxRequests: 10, windowSeconds: 3600 },
  admin_verify: { maxRequests: 20, windowSeconds: 3600 }
};

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

describe("admin worker — fetch handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const okResponse = new Response("<html>OK</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
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

    // Session middleware: response null means allow through
    requireSession.mockResolvedValue({
      session: { id: 1, token: "test-session" },
      response: null
    });

    // Rate limiting defaults: allow all requests
    getRateLimitConfig.mockResolvedValue(RATE_LIMITS);
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockImplementation((pathname) => {
      if (pathname === "/admin/login") {
        return "admin_login";
      }
      if (pathname === "/admin/verify") {
        return "admin_verify";
      }
      return null;
    });
  });

  describe("routing", () => {
    it("routes GET /admin/login to handleLogin", async () => {
      const request = makeRequest("GET", "/admin/login");

      await adminApp.fetch(request, env);

      expect(handleLogin).toHaveBeenCalledWith(request, env);
    });

    it("routes POST /admin/login to handleLoginSubmit", async () => {
      const request = makeRequest("POST", "/admin/login");

      await adminApp.fetch(request, env);

      expect(handleLoginSubmit).toHaveBeenCalledWith(request, env);
    });

    it("routes GET /admin/verify to handleAdminVerify", async () => {
      const request = makeRequest("GET", "/admin/verify?token=abc");

      await adminApp.fetch(request, env);

      expect(handleAdminVerify).toHaveBeenCalledWith(request, env);
    });

    it("routes GET /admin/logout to handleLogout", async () => {
      const request = makeRequest("GET", "/admin/logout");

      await adminApp.fetch(request, env);

      expect(handleLogout).toHaveBeenCalledWith(request, env);
    });

    it("returns 405 for POST /admin/verify", async () => {
      const request = makeRequest("POST", "/admin/verify");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it("returns 405 for POST /admin/logout", async () => {
      const request = makeRequest("POST", "/admin/logout");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it("returns 404 for unknown /admin paths", async () => {
      const request = makeRequest("GET", "/admin/nonexistent");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(404);
    });
  });

  describe("no CORS handling", () => {
    it("does not add CORS headers to responses (same-origin only)", async () => {
      const request = makeRequest("GET", "/admin/login");

      const response = await adminApp.fetch(request, env);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("does not handle OPTIONS preflight requests specially", async () => {
      const request = makeRequest("OPTIONS", "/admin/login");

      const response = await adminApp.fetch(request, env);

      // Should not return 204 like the API worker does
      // The admin worker has no CORS handler
      expect(response.status).not.toBe(204);
    });
  });

  describe("rate limiting on auth endpoints", () => {
    it("rate limits POST /admin/login requests", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });
      getEndpointName.mockReturnValue("admin_login");

      const request = makeRequest("POST", "/admin/login", {
        "CF-Connecting-IP": "1.2.3.4"
      });

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("900");
      expect(handleLoginSubmit).not.toHaveBeenCalled();
    });

    it("rate limits GET /admin/verify requests", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });
      getEndpointName.mockReturnValue("admin_verify");

      const request = makeRequest("GET", "/admin/verify?token=abc", {
        "CF-Connecting-IP": "1.2.3.4"
      });

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(429);
      expect(handleAdminVerify).not.toHaveBeenCalled();
    });

    it("skips rate limiting when endpoint has no limits configured", async () => {
      // getEndpointName returns a name but rateLimitMap has no entry for it
      getEndpointName.mockReturnValue("some_unknown_endpoint");
      getRateLimitConfig.mockResolvedValue(RATE_LIMITS);

      const request = makeRequest("GET", "/admin/something", {
        "CF-Connecting-IP": "1.2.3.4"
      });

      await adminApp.fetch(request, env);

      // Should not crash, just proceed without rate limiting
      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("allows requests through when rate check passes", async () => {
      checkRateLimit.mockResolvedValue({ allowed: true });

      const request = makeRequest("POST", "/admin/login", {
        "CF-Connecting-IP": "1.2.3.4"
      });

      await adminApp.fetch(request, env);

      expect(handleLoginSubmit).toHaveBeenCalled();
    });

    it("returns 429 JSON body with error message", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });
      getEndpointName.mockReturnValue("admin_login");

      const request = makeRequest("POST", "/admin/login", {
        "CF-Connecting-IP": "1.2.3.4"
      });

      const response = await adminApp.fetch(request, env);
      const body = await response.json();

      expect(body.error).toBe("Too Many Requests");
    });
  });

  describe("session middleware for protected routes", () => {
    it("applies session middleware to GET /admin (root)", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login?redirect=%2Fadmin" }
        })
      });

      const request = makeRequest("GET", "/admin");

      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalledWith(request, env);
      expect(response.status).toBe(302);
    });

    it("does NOT apply session middleware to /admin/login", async () => {
      const request = makeRequest("GET", "/admin/login");

      await adminApp.fetch(request, env);

      expect(requireSession).not.toHaveBeenCalled();
    });

    it("does NOT apply session middleware to /admin/verify", async () => {
      const request = makeRequest("GET", "/admin/verify?token=abc");

      await adminApp.fetch(request, env);

      expect(requireSession).not.toHaveBeenCalled();
    });

    it("does NOT apply session middleware to /admin/logout", async () => {
      const request = makeRequest("GET", "/admin/logout");

      await adminApp.fetch(request, env);

      expect(requireSession).not.toHaveBeenCalled();
    });

    it("applies session middleware to arbitrary protected admin paths", async () => {
      requireSession.mockResolvedValue({
        session: { id: 1, token: "test-session" },
        response: null
      });

      const request = makeRequest("GET", "/admin/channels/123/feeds");

      await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalledWith(request, env);
    });

    it("redirects to login when session is invalid on protected route", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: {
            Location: "/admin/login?redirect=%2Fadmin%2Fchannels%2F123%2Ffeeds"
          }
        })
      });

      const request = makeRequest("GET", "/admin/channels/123/feeds");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("/admin/login");
      expect(response.headers.get("Location")).toContain("redirect=");
    });

    it("allows through when session middleware returns null (valid session)", async () => {
      requireSession.mockResolvedValue({
        session: { id: 1, token: "test-session" },
        response: null
      });

      const request = makeRequest("GET", "/admin");

      await adminApp.fetch(request, env);

      // Since requireSession returned null (allowed), the worker should
      // proceed to handle the /admin route
      expect(requireSession).toHaveBeenCalled();
    });
  });

  describe("admin dashboard", () => {
    it("routes GET /admin to handleDashboard", async () => {
      requireSession.mockResolvedValue({
        session: { id: 1, token: "test-session" },
        response: null
      });
      handleDashboard.mockResolvedValue(
        new Response("<html>dashboard</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" }
        })
      );

      const request = makeRequest("GET", "/admin");

      const response = await adminApp.fetch(request, env);

      expect(handleDashboard).toHaveBeenCalledWith(request, env);
      expect(response.status).toBe(200);
    });

    it("returns 405 for non-GET requests to /admin", async () => {
      requireSession.mockResolvedValue({
        session: { id: 1, token: "test-session" },
        response: null
      });

      const request = makeRequest("POST", "/admin");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  describe("trailing-slash normalization", () => {
    describe("GET requests with trailing slash redirect to canonical URL", () => {
      it("redirects GET /admin/login/ to /admin/login with 301", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/admin/login/"),
          env
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe("/admin/login");
        expect(response.body).toBeNull();
      });

      it("redirects GET /admin/ to /admin with 301", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/admin/"),
          env
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe("/admin");
      });

      it("redirects GET /admin/verify/ to /admin/verify with 301", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/admin/verify/"),
          env
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe("/admin/verify");
      });

      it("redirects GET /admin/logout/ to /admin/logout with 301", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/admin/logout/"),
          env
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe("/admin/logout");
      });

      it("strips multiple trailing slashes on GET redirect", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/admin/login///"),
          env
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe("/admin/login");
      });

      it("preserves query string on GET redirect", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/admin/verify/?token=abc123"),
          env
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
          "/admin/verify?token=abc123"
        );
      });

      it("preserves complex query strings on GET redirect", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/admin/login/?redirect=%2Fadmin&foo=bar"),
          env
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
          "/admin/login?redirect=%2Fadmin&foo=bar"
        );
      });

      it("does not redirect GET / (bare root path)", async () => {
        const response = await adminApp.fetch(makeRequest("GET", "/"), env);

        expect(response.status).not.toBe(301);
      });

      it("redirect happens before rate limiting", async () => {
        await adminApp.fetch(makeRequest("GET", "/admin/login/"), env);

        expect(checkRateLimit).not.toHaveBeenCalled();
      });

      it("redirect happens before session middleware", async () => {
        await adminApp.fetch(makeRequest("GET", "/admin/"), env);

        expect(requireSession).not.toHaveBeenCalled();
      });
    });

    describe("non-GET requests silently strip trailing slashes", () => {
      it("handles POST /admin/login/ identically to POST /admin/login", async () => {
        const request = makeRequest("POST", "/admin/login/");

        const response = await adminApp.fetch(request, env);

        expect(response.status).not.toBe(301);
        expect(handleLoginSubmit).toHaveBeenCalledWith(request, env);
      });

      it("handles POST with multiple trailing slashes", async () => {
        const request = makeRequest("POST", "/admin/login///");

        const response = await adminApp.fetch(request, env);

        expect(response.status).not.toBe(301);
        expect(handleLoginSubmit).toHaveBeenCalledWith(request, env);
      });

      it("does not strip bare / on non-GET requests", async () => {
        const response = await adminApp.fetch(makeRequest("POST", "/"), env);

        expect(response.status).not.toBe(301);
      });
    });

    describe("paths caught by broadened route pattern return 404", () => {
      it("returns 404 for GET /adminfoo", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/adminfoo"),
          env
        );

        expect(response.status).toBe(404);
      });

      it("returns 404 for GET /administrator", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/administrator"),
          env
        );

        expect(response.status).toBe(404);
      });

      it("returns 404 for GET /admin-panel", async () => {
        const response = await adminApp.fetch(
          makeRequest("GET", "/admin-panel"),
          env
        );

        expect(response.status).toBe(404);
      });
    });
  });

  describe("error handling", () => {
    it("catches unhandled errors and returns 500", async () => {
      handleLogin.mockRejectedValue(new Error("Unexpected error"));

      const request = makeRequest("GET", "/admin/login");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(500);
    });
  });
});
