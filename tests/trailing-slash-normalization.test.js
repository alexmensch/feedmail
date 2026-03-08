import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Admin Worker mocks ────────────────────────────────────────────────────
vi.mock("../src/admin/routes/auth.js", () => ({
  handleLogin: vi.fn(),
  handleLoginSubmit: vi.fn(),
  handleAdminVerify: vi.fn(),
  handleLogout: vi.fn()
}));
vi.mock("../src/admin/lib/session.js", () => ({
  requireSession: vi.fn(),
  getSessionFromCookie: vi.fn(),
  SESSION_COOKIE_NAME: "feedmail_admin_session",
  SESSION_TTL_SECONDS: 86400
}));

// ─── API Worker mocks ──────────────────────────────────────────────────────
vi.mock("../src/api/routes/subscribe.js", () => ({
  handleSubscribe: vi.fn()
}));
vi.mock("../src/api/routes/verify.js", () => ({
  handleVerify: vi.fn()
}));
vi.mock("../src/api/routes/unsubscribe.js", () => ({
  handleUnsubscribe: vi.fn()
}));
vi.mock("../src/api/routes/send.js", () => ({
  handleSend: vi.fn(),
  checkFeedsAndSend: vi.fn()
}));
vi.mock("../src/api/routes/admin.js", () => ({
  handleAdmin: vi.fn()
}));
vi.mock("../src/api/lib/cors.js", () => ({
  handleCORSPreflight: vi.fn(),
  withCORS: vi.fn()
}));

// ─── Shared mocks (used by both workers) ───────────────────────────────────
vi.mock("../src/shared/lib/config.js", () => ({
  getRateLimitConfig: vi.fn()
}));
vi.mock("../src/shared/lib/rate-limit.js", () => ({
  checkRateLimit: vi.fn(),
  getEndpointName: vi.fn()
}));
vi.mock("../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>mock</html>")
}));
vi.mock("../src/shared/lib/response.js", () => ({
  htmlResponse: vi.fn().mockImplementation(
    (html, status = 200) =>
      new Response(html, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));
vi.mock("../src/shared/lib/db.js", () => ({
  getCredential: vi.fn()
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────
import adminApp from "../src/admin/worker.js";
import apiApp from "../src/api/worker.js";
import {
  handleLogin,
  handleLoginSubmit,
  handleAdminVerify,
  handleLogout
} from "../src/admin/routes/auth.js";
import { requireSession } from "../src/admin/lib/session.js";
import { handleSubscribe } from "../src/api/routes/subscribe.js";
import { handleVerify } from "../src/api/routes/verify.js";
import { handleUnsubscribe } from "../src/api/routes/unsubscribe.js";
import { handleSend } from "../src/api/routes/send.js";
import { handleAdmin } from "../src/api/routes/admin.js";
import { handleCORSPreflight, withCORS } from "../src/api/lib/cors.js";
import { getRateLimitConfig } from "../src/shared/lib/config.js";
import {
  checkRateLimit,
  getEndpointName
} from "../src/shared/lib/rate-limit.js";
import { getCredential } from "../src/shared/lib/db.js";

// ─── Shared test helpers ───────────────────────────────────────────────────

const ADMIN_RATE_LIMITS = {
  admin_login: { maxRequests: 10, windowSeconds: 3600 },
  admin_verify: { maxRequests: 20, windowSeconds: 3600 }
};

const API_RATE_LIMITS = {
  subscribe: { maxRequests: 10, windowSeconds: 3600 },
  verify: { maxRequests: 20, windowSeconds: 3600 },
  unsubscribe: { maxRequests: 20, windowSeconds: 3600 },
  send: { maxRequests: 5, windowSeconds: 3600 },
  admin: { maxRequests: 30, windowSeconds: 3600 }
};

const adminEnv = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

const apiEnv = {
  ADMIN_API_KEY: "test-admin-key",
  DB: {}
};

function makeAdminRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(`https://feedmail.example.com${path}`, {
    method,
    headers: reqHeaders
  });
}

function makeApiRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(`https://feedmail.cc${path}`, {
    method,
    headers: reqHeaders
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// wrangler.admin.toml route pattern
// ═══════════════════════════════════════════════════════════════════════════

describe("wrangler.admin.toml route pattern", () => {
  it("uses YOUR_DOMAIN/admin* pattern (not YOUR_DOMAIN/admin/*)", () => {
    const tomlPath = resolve(
      import.meta.dirname,
      "..",
      "wrangler.admin.toml"
    );
    const toml = readFileSync(tomlPath, "utf-8");

    // The pattern should be "YOUR_DOMAIN/admin*" (catches /admin, /admin/, /adminfoo, etc.)
    expect(toml).toContain('pattern = "YOUR_DOMAIN/admin*"');
    // Make sure the old pattern with the slash is NOT present
    expect(toml).not.toContain('pattern = "YOUR_DOMAIN/admin/*"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Admin Worker trailing-slash handling
// ═══════════════════════════════════════════════════════════════════════════

describe("Admin Worker trailing-slash handling", () => {
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

    requireSession.mockResolvedValue({
      session: { id: 1, token: "test-session" },
      response: null
    });

    getRateLimitConfig.mockResolvedValue(ADMIN_RATE_LIMITS);
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockImplementation((pathname) => {
      if (pathname === "/admin/login") return "admin_login";
      if (pathname === "/admin/verify") return "admin_verify";
      return null;
    });
    getCredential.mockResolvedValue("admin@example.com");
  });

  describe("GET requests with trailing slash redirect to canonical URL", () => {
    it("redirects GET /admin/login/ to /admin/login with 301", async () => {
      const request = makeAdminRequest("GET", "/admin/login/");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe("/admin/login");
      expect(response.body).toBeNull();
    });

    it("redirects GET /admin/ to /admin with 301", async () => {
      const request = makeAdminRequest("GET", "/admin/");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe("/admin");
    });

    it("redirects GET /admin/verify/ to /admin/verify with 301", async () => {
      const request = makeAdminRequest("GET", "/admin/verify/");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe("/admin/verify");
    });

    it("redirects GET /admin/logout/ to /admin/logout with 301", async () => {
      const request = makeAdminRequest("GET", "/admin/logout/");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe("/admin/logout");
    });

    it("strips multiple trailing slashes on GET redirect", async () => {
      const request = makeAdminRequest("GET", "/admin/login///");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe("/admin/login");
    });

    it("preserves query string on GET redirect", async () => {
      const request = makeAdminRequest(
        "GET",
        "/admin/verify/?token=abc123"
      );

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe(
        "/admin/verify?token=abc123"
      );
    });

    it("preserves complex query strings on GET redirect", async () => {
      const request = makeAdminRequest(
        "GET",
        "/admin/login/?redirect=%2Fadmin&foo=bar"
      );

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe(
        "/admin/login?redirect=%2Fadmin&foo=bar"
      );
    });

    it("does not redirect GET / (bare root path)", async () => {
      const request = makeAdminRequest("GET", "/");

      const response = await adminApp.fetch(request, adminEnv);

      // Should pass through to normal routing (likely 404), not redirect
      expect(response.status).not.toBe(301);
    });

    it("redirect happens before rate limiting", async () => {
      const request = makeAdminRequest("GET", "/admin/login/");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      // Rate limiting should not have been invoked
      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("redirect happens before session middleware", async () => {
      const request = makeAdminRequest("GET", "/admin/");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(301);
      expect(requireSession).not.toHaveBeenCalled();
    });
  });

  describe("non-GET requests silently strip trailing slashes", () => {
    it("handles POST /admin/login/ identically to POST /admin/login", async () => {
      const request = makeAdminRequest("POST", "/admin/login/");

      const response = await adminApp.fetch(request, adminEnv);

      // Should NOT redirect — silent strip
      expect(response.status).not.toBe(301);
      expect(handleLoginSubmit).toHaveBeenCalledWith(request, adminEnv);
    });

    it("handles POST with multiple trailing slashes", async () => {
      const request = makeAdminRequest("POST", "/admin/login///");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).not.toBe(301);
      expect(handleLoginSubmit).toHaveBeenCalledWith(request, adminEnv);
    });

    it("does not strip bare / on non-GET requests", async () => {
      const request = makeAdminRequest("POST", "/");

      const response = await adminApp.fetch(request, adminEnv);

      // Should not be treated as /admin — should result in 404
      expect(response.status).not.toBe(301);
    });
  });

  describe("paths like /adminfoo or /administrator return 404", () => {
    it("returns 404 for GET /adminfoo", async () => {
      const request = makeAdminRequest("GET", "/adminfoo");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(404);
    });

    it("returns 404 for GET /administrator", async () => {
      const request = makeAdminRequest("GET", "/administrator");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(404);
    });

    it("returns 404 for GET /admin-panel", async () => {
      const request = makeAdminRequest("GET", "/admin-panel");

      const response = await adminApp.fetch(request, adminEnv);

      expect(response.status).toBe(404);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Admin Worker dashboard route simplification
// ═══════════════════════════════════════════════════════════════════════════

describe("Admin Worker dashboard route simplification", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    handleLogin.mockResolvedValue(
      new Response("<html>OK</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      })
    );

    requireSession.mockResolvedValue({
      session: { id: 1, token: "test-session" },
      response: null
    });

    getRateLimitConfig.mockResolvedValue(ADMIN_RATE_LIMITS);
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockReturnValue(null);
    getCredential.mockResolvedValue("admin@example.com");
  });

  it("source code only checks url.pathname === '/admin' (no '/admin/' check)", () => {
    const workerPath = resolve(
      import.meta.dirname,
      "..",
      "src",
      "admin",
      "worker.js"
    );
    const source = readFileSync(workerPath, "utf-8");

    // After implementation, the dashboard check should be simplified to just "/admin"
    // The old pattern was: url.pathname === "/admin" || url.pathname === "/admin/"
    expect(source).toContain('url.pathname === "/admin"');
    expect(source).not.toMatch(
      /url\.pathname\s*===\s*["']\/admin\/["']/
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API Worker trailing-slash handling
// ═══════════════════════════════════════════════════════════════════════════

describe("API Worker trailing-slash handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const okResponse = new Response("OK", { status: 200 });
    handleSubscribe.mockResolvedValue(okResponse);
    handleVerify.mockResolvedValue(okResponse);
    handleUnsubscribe.mockResolvedValue(okResponse);
    handleSend.mockResolvedValue(okResponse);
    handleAdmin.mockResolvedValue(okResponse);
    handleCORSPreflight.mockReturnValue(new Response(null, { status: 204 }));
    withCORS.mockImplementation((response) => response);

    getRateLimitConfig.mockResolvedValue(API_RATE_LIMITS);
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockImplementation((pathname) => {
      if (pathname === "/api/subscribe") return "subscribe";
      if (pathname === "/api/verify") return "verify";
      if (pathname === "/api/unsubscribe") return "unsubscribe";
      if (pathname === "/api/send") return "send";
      if (pathname.startsWith("/api/admin/")) return "admin";
      return null;
    });
  });

  describe("trailing slashes are silently stripped (no redirect)", () => {
    it("handles POST /api/subscribe/ same as POST /api/subscribe", async () => {
      const request = makeApiRequest("POST", "/api/subscribe/");

      const response = await apiApp.fetch(request, apiEnv);

      expect(response.status).not.toBe(301);
      expect(handleSubscribe).toHaveBeenCalledWith(request, apiEnv);
    });

    it("handles GET /api/verify/ same as GET /api/verify", async () => {
      const request = makeApiRequest("GET", "/api/verify/?token=abc");

      const response = await apiApp.fetch(request, apiEnv);

      expect(response.status).not.toBe(301);
      expect(handleVerify).toHaveBeenCalledWith(
        request,
        apiEnv,
        expect.any(URL)
      );
    });

    it("preserves query string after stripping trailing slash", async () => {
      const request = makeApiRequest("GET", "/api/verify/?token=abc");

      await apiApp.fetch(request, apiEnv);

      // The URL object passed to handleVerify should have the token param
      const passedUrl = handleVerify.mock.calls[0][2];
      expect(passedUrl.searchParams.get("token")).toBe("abc");
    });

    it("handles GET /api/unsubscribe/ same as GET /api/unsubscribe", async () => {
      const request = makeApiRequest(
        "GET",
        "/api/unsubscribe/?token=xyz"
      );

      await apiApp.fetch(request, apiEnv);

      expect(handleUnsubscribe).toHaveBeenCalledWith(
        request,
        apiEnv,
        expect.any(URL)
      );
    });

    it("handles POST /api/unsubscribe/ same as POST /api/unsubscribe", async () => {
      const request = makeApiRequest(
        "POST",
        "/api/unsubscribe/?token=xyz"
      );

      await apiApp.fetch(request, apiEnv);

      expect(handleUnsubscribe).toHaveBeenCalledWith(
        request,
        apiEnv,
        expect.any(URL)
      );
    });

    it("handles POST /api/send/ same as POST /api/send", async () => {
      const request = makeApiRequest("POST", "/api/send/", {
        Authorization: "Bearer test-admin-key"
      });

      await apiApp.fetch(request, apiEnv);

      expect(handleSend).toHaveBeenCalledWith(request, apiEnv);
    });

    it("handles GET /api/admin/stats/ same as GET /api/admin/stats", async () => {
      const request = makeApiRequest("GET", "/api/admin/stats/", {
        Authorization: "Bearer test-admin-key"
      });

      await apiApp.fetch(request, apiEnv);

      expect(handleAdmin).toHaveBeenCalledWith(
        request,
        apiEnv,
        expect.any(URL)
      );
    });

    it("strips multiple trailing slashes", async () => {
      const request = makeApiRequest("POST", "/api/subscribe///");

      await apiApp.fetch(request, apiEnv);

      expect(handleSubscribe).toHaveBeenCalledWith(request, apiEnv);
    });
  });

  describe("method enforcement works with trailing slashes", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns 408 timeout for GET /api/subscribe/ (wrong method)", async () => {
      const responsePromise = apiApp.fetch(
        makeApiRequest("GET", "/api/subscribe/"),
        apiEnv
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(response.status).toBe(408);
      expect(handleSubscribe).not.toHaveBeenCalled();
    });

    it("returns 408 timeout for DELETE /api/verify/ (wrong method)", async () => {
      const responsePromise = apiApp.fetch(
        makeApiRequest("DELETE", "/api/verify/"),
        apiEnv
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(response.status).toBe(408);
      expect(handleVerify).not.toHaveBeenCalled();
    });
  });

  describe("bare / is not affected by trailing slash normalization", () => {
    it("returns 404 for GET / (not treated differently)", async () => {
      const response = await apiApp.fetch(
        makeApiRequest("GET", "/"),
        apiEnv
      );

      expect(response.status).toBe(404);
      expect(response.body).toBeNull();
    });
  });

  describe("unknown paths with trailing slashes still return 404", () => {
    it("returns 404 for GET /api/unknown/", async () => {
      const response = await apiApp.fetch(
        makeApiRequest("GET", "/api/unknown/"),
        apiEnv
      );

      expect(response.status).toBe(404);
      expect(response.body).toBeNull();
    });

    it("returns 404 for GET /api/unknown///", async () => {
      const response = await apiApp.fetch(
        makeApiRequest("GET", "/api/unknown///"),
        apiEnv
      );

      expect(response.status).toBe(404);
      expect(response.body).toBeNull();
    });
  });

  describe("normalization runs before rate limiting and auth", () => {
    it("uses the normalized pathname for rate limiting", async () => {
      const request = makeApiRequest("POST", "/api/subscribe/", {
        "CF-Connecting-IP": "1.2.3.4"
      });

      await apiApp.fetch(request, apiEnv);

      // getEndpointName should be called with the normalized pathname (no trailing slash)
      expect(getEndpointName).toHaveBeenCalledWith("/api/subscribe");
    });

    it("rate limits requests with trailing slashes correctly", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await apiApp.fetch(
        makeApiRequest("POST", "/api/subscribe/", {
          "CF-Connecting-IP": "1.2.3.4"
        }),
        apiEnv
      );

      expect(response.status).toBe(429);
      expect(handleSubscribe).not.toHaveBeenCalled();
    });
  });
});
