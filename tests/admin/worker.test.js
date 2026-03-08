import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock route handlers
vi.mock("../../src/admin/routes/auth.js", () => ({
  handleLogin: vi.fn(),
  handleLoginSubmit: vi.fn(),
  handleAdminVerify: vi.fn(),
  handleLogout: vi.fn()
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
import { getCredential } from "../../src/shared/lib/db.js";
import { render } from "../../src/shared/lib/templates.js";

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

  describe("admin dashboard placeholder", () => {
    it("renders placeholder when admin email is configured", async () => {
      requireSession.mockResolvedValue({
        session: { id: 1, token: "test-session" },
        response: null
      });
      getCredential.mockResolvedValue("admin@example.com");

      const request = makeRequest("GET", "/admin");

      const response = await adminApp.fetch(request, env);

      expect(getCredential).toHaveBeenCalledWith(env.DB, "admin_email");
      expect(render).toHaveBeenCalledWith("adminPlaceholder", {});
      expect(response.status).toBe(200);
    });

    it("renders setup error when admin email is not configured", async () => {
      requireSession.mockResolvedValue({
        session: { id: 1, token: "test-session" },
        response: null
      });
      getCredential.mockResolvedValue(null);

      const request = makeRequest("GET", "/admin");

      const response = await adminApp.fetch(request, env);

      expect(render).toHaveBeenCalledWith(
        "adminPlaceholder",
        expect.objectContaining({ setupError: expect.any(String) })
      );
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

  describe("error handling", () => {
    it("catches unhandled errors and returns 500", async () => {
      handleLogin.mockRejectedValue(new Error("Unexpected error"));

      const request = makeRequest("GET", "/admin/login");

      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(500);
    });
  });
});
