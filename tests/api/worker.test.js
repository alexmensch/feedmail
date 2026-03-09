import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all route handlers and cors
vi.mock("../../src/api/routes/subscribe.js", () => ({
  handleSubscribe: vi.fn()
}));
vi.mock("../../src/api/routes/verify.js", () => ({
  handleVerify: vi.fn()
}));
vi.mock("../../src/api/routes/unsubscribe.js", () => ({
  handleUnsubscribe: vi.fn()
}));
vi.mock("../../src/api/routes/send.js", () => ({
  handleSend: vi.fn(),
  checkFeedsAndSend: vi.fn()
}));
vi.mock("../../src/api/routes/admin.js", () => ({
  handleAdmin: vi.fn()
}));
vi.mock("../../src/api/lib/cors.js", () => ({
  handleCORSPreflight: vi.fn(),
  withCORS: vi.fn()
}));
vi.mock("../../src/shared/lib/config.js", () => ({
  getRateLimitConfig: vi.fn()
}));
vi.mock("../../src/shared/lib/rate-limit.js", () => ({
  checkRateLimit: vi.fn(),
  getEndpointName: vi.fn()
}));
vi.mock("../../src/shared/lib/db.js", () => ({
  getCredential: vi.fn()
}));
vi.mock("../../src/shared/lib/response.js", () => ({
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

import app from "../../src/api/worker.js";
import { handleSubscribe } from "../../src/api/routes/subscribe.js";
import { handleVerify } from "../../src/api/routes/verify.js";
import { handleUnsubscribe } from "../../src/api/routes/unsubscribe.js";
import { handleSend, checkFeedsAndSend } from "../../src/api/routes/send.js";
import { handleAdmin } from "../../src/api/routes/admin.js";
import { handleCORSPreflight, withCORS } from "../../src/api/lib/cors.js";
import { getRateLimitConfig } from "../../src/shared/lib/config.js";
import {
  checkRateLimit,
  getEndpointName
} from "../../src/shared/lib/rate-limit.js";

const RATE_LIMITS = {
  subscribe: { maxRequests: 10, windowSeconds: 3600 },
  verify: { maxRequests: 20, windowSeconds: 3600 },
  unsubscribe: { maxRequests: 20, windowSeconds: 3600 },
  send: { maxRequests: 5, windowSeconds: 3600 },
  admin: { maxRequests: 30, windowSeconds: 3600 }
};

const env = {
  ADMIN_API_KEY: "test-admin-key",
  DB: {}
};

function makeRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(`https://feedmail.cc${path}`, {
    method,
    headers: reqHeaders
  });
}

describe("index.js — fetch handler", () => {
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

    // Rate limiting defaults: allow all requests
    getRateLimitConfig.mockResolvedValue(RATE_LIMITS);
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockImplementation((pathname) => {
      if (pathname === "/api/subscribe") {
        return "subscribe";
      }
      if (pathname === "/api/verify") {
        return "verify";
      }
      if (pathname === "/api/unsubscribe") {
        return "unsubscribe";
      }
      if (pathname === "/api/send") {
        return "send";
      }
      if (pathname.startsWith("/api/admin/")) {
        return "admin";
      }
      return null;
    });
  });

  describe("CORS preflight", () => {
    it("handles OPTIONS requests via handleCORSPreflight", async () => {
      const request = makeRequest("OPTIONS", "/api/subscribe");

      const response = await app.fetch(request, env);

      expect(handleCORSPreflight).toHaveBeenCalledWith(request, env);
      expect(response.status).toBe(204);
    });

    it("handles OPTIONS for any path", async () => {
      await app.fetch(makeRequest("OPTIONS", "/api/anything"), env);
      expect(handleCORSPreflight).toHaveBeenCalled();
    });

    it("handles OPTIONS for unknown /api paths without timeout", async () => {
      await app.fetch(makeRequest("OPTIONS", "/api/nonexistent"), env);
      expect(handleCORSPreflight).toHaveBeenCalled();
    });
  });

  describe("POST /api/subscribe", () => {
    it("delegates to handleSubscribe and wraps with CORS", async () => {
      const request = makeRequest("POST", "/api/subscribe");

      await app.fetch(request, env);

      expect(handleSubscribe).toHaveBeenCalledWith(request, env);
      expect(withCORS).toHaveBeenCalled();
    });
  });

  describe("GET /api/verify", () => {
    it("delegates to handleVerify with request, env, and url", async () => {
      const request = makeRequest("GET", "/api/verify?token=abc");

      await app.fetch(request, env);

      expect(handleVerify).toHaveBeenCalledWith(request, env, expect.any(URL));
    });

    it("does not wrap verify response with CORS", async () => {
      await app.fetch(makeRequest("GET", "/api/verify?token=abc"), env);

      expect(withCORS).not.toHaveBeenCalled();
    });
  });

  describe("/api/unsubscribe", () => {
    it("delegates GET to handleUnsubscribe", async () => {
      await app.fetch(makeRequest("GET", "/api/unsubscribe?token=abc"), env);
      expect(handleUnsubscribe).toHaveBeenCalled();
    });

    it("delegates POST to handleUnsubscribe", async () => {
      await app.fetch(makeRequest("POST", "/api/unsubscribe?token=abc"), env);
      expect(handleUnsubscribe).toHaveBeenCalled();
    });

    it("passes url to handleUnsubscribe", async () => {
      await app.fetch(makeRequest("GET", "/api/unsubscribe?token=xyz"), env);
      expect(handleUnsubscribe).toHaveBeenCalledWith(
        expect.any(Request),
        env,
        expect.any(URL)
      );
    });
  });

  describe("POST /api/send (authenticated)", () => {
    it("delegates to handleSend with valid auth", async () => {
      const request = makeRequest("POST", "/api/send", {
        Authorization: "Bearer test-admin-key"
      });

      await app.fetch(request, env);

      expect(handleSend).toHaveBeenCalledWith(request, env);
    });

    it("returns 401 without Authorization header", async () => {
      const response = await app.fetch(makeRequest("POST", "/api/send"), env);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
      expect(handleSend).not.toHaveBeenCalled();
    });

    it("returns 401 with wrong API key", async () => {
      const response = await app.fetch(
        makeRequest("POST", "/api/send", {
          Authorization: "Bearer wrong-key"
        }),
        env
      );

      expect(response.status).toBe(401);
      expect(handleSend).not.toHaveBeenCalled();
    });
  });

  describe("/api/admin/* (authenticated)", () => {
    it("delegates to handleAdmin with valid auth", async () => {
      const request = makeRequest("GET", "/api/admin/stats?siteId=test", {
        Authorization: "Bearer test-admin-key"
      });

      await app.fetch(request, env);

      expect(handleAdmin).toHaveBeenCalledWith(request, env, expect.any(URL));
    });

    it("returns 401 without auth for admin routes", async () => {
      const response = await app.fetch(
        makeRequest("GET", "/api/admin/stats"),
        env
      );

      expect(response.status).toBe(401);
      expect(handleAdmin).not.toHaveBeenCalled();
    });

    it("delegates to handleAdmin for /api/admin/subscribers", async () => {
      await app.fetch(
        makeRequest("GET", "/api/admin/subscribers?siteId=test", {
          Authorization: "Bearer test-admin-key"
        }),
        env
      );

      expect(handleAdmin).toHaveBeenCalled();
    });

    it("handles case-insensitive Bearer prefix", async () => {
      await app.fetch(
        makeRequest("GET", "/api/admin/stats?siteId=test", {
          Authorization: "bearer test-admin-key"
        }),
        env
      );

      expect(handleAdmin).toHaveBeenCalled();
    });

    it("handles Bearer with extra whitespace", async () => {
      await app.fetch(
        makeRequest("GET", "/api/admin/stats?siteId=test", {
          Authorization: "Bearer   test-admin-key"
        }),
        env
      );

      expect(handleAdmin).toHaveBeenCalled();
    });
  });

  describe("unknown paths", () => {
    it("returns 404 with no body for root path", async () => {
      const response = await app.fetch(makeRequest("GET", "/"), env);
      expect(response.status).toBe(404);
      expect(response.body).toBeNull();
    });

    it("returns 404 with no body for non-API paths", async () => {
      const response = await app.fetch(makeRequest("GET", "/unknown"), env);
      expect(response.status).toBe(404);
      expect(response.body).toBeNull();
    });

    it("returns 404 for unknown /api paths", async () => {
      const response = await app.fetch(makeRequest("GET", "/api/unknown"), env);
      expect(response.status).toBe(404);
      expect(response.body).toBeNull();
    });

    it("returns 404 for unknown /api/admin subpaths", async () => {
      const response = await app.fetch(
        makeRequest("GET", "/api/admin/anything", {
          Authorization: "Bearer test-admin-key"
        }),
        env
      );
      expect(response.status).toBe(404);
      expect(handleAdmin).not.toHaveBeenCalled();
    });

    it("returns 404 immediately without delay for unknown paths", async () => {
      vi.useFakeTimers();

      let resolved = false;
      const responsePromise = app
        .fetch(makeRequest("GET", "/api/unknown"), env)
        .then((r) => {
          resolved = true;
          return r;
        });

      // Advance just 1ms — far less than the 10s timeout delay
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);

      const response = await responsePromise;
      expect(response.status).toBe(404);

      vi.useRealTimers();
    });
  });

  describe("method enforcement with timeouts", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("times out for GET on /api/subscribe (only POST allowed)", async () => {
      const responsePromise = app.fetch(
        makeRequest("GET", "/api/subscribe"),
        env
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(handleSubscribe).not.toHaveBeenCalled();
      expect(response.status).toBe(408);
      expect(response.body).toBeNull();
    });

    it("times out for DELETE on /api/subscribe", async () => {
      const responsePromise = app.fetch(
        makeRequest("DELETE", "/api/subscribe"),
        env
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(handleSubscribe).not.toHaveBeenCalled();
      expect(response.status).toBe(408);
    });

    it("times out for POST on /api/verify (only GET allowed)", async () => {
      const responsePromise = app.fetch(
        makeRequest("POST", "/api/verify"),
        env
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(handleVerify).not.toHaveBeenCalled();
      expect(response.status).toBe(408);
    });

    it("times out for PUT on /api/unsubscribe (only GET and POST allowed)", async () => {
      const responsePromise = app.fetch(
        makeRequest("PUT", "/api/unsubscribe?token=abc"),
        env
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(handleUnsubscribe).not.toHaveBeenCalled();
      expect(response.status).toBe(408);
    });

    it("times out for DELETE on /api/unsubscribe", async () => {
      const responsePromise = app.fetch(
        makeRequest("DELETE", "/api/unsubscribe?token=abc"),
        env
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(handleUnsubscribe).not.toHaveBeenCalled();
      expect(response.status).toBe(408);
    });

    it("times out for GET on /api/send (only POST allowed)", async () => {
      const responsePromise = app.fetch(
        makeRequest("GET", "/api/send", {
          Authorization: "Bearer test-admin-key"
        }),
        env
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(handleSend).not.toHaveBeenCalled();
      expect(response.status).toBe(408);
    });

    it("times out for POST on /api/admin/stats (only GET allowed)", async () => {
      const responsePromise = app.fetch(
        makeRequest("POST", "/api/admin/stats", {
          Authorization: "Bearer test-admin-key"
        }),
        env
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await responsePromise;

      expect(handleAdmin).not.toHaveBeenCalled();
      expect(response.status).toBe(408);
    });

    it("does not resolve before the delay elapses", async () => {
      let resolved = false;
      const responsePromise = app
        .fetch(makeRequest("GET", "/api/subscribe"), env)
        .then((r) => {
          resolved = true;
          return r;
        });

      // Advance to just before the timeout
      await vi.advanceTimersByTimeAsync(9_999);
      expect(resolved).toBe(false);

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(1);
      const response = await responsePromise;
      expect(resolved).toBe(true);
      expect(response.status).toBe(408);
    });
  });

  describe("IP-based rate limiting", () => {
    it("returns 429 with Retry-After header when rate limited", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

      const response = await app.fetch(
        makeRequest("POST", "/api/subscribe", {
          "CF-Connecting-IP": "1.2.3.4"
        }),
        env
      );

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("900");
    });

    it("returns 429 JSON body with error message", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await app.fetch(
        makeRequest("POST", "/api/subscribe", {
          "CF-Connecting-IP": "1.2.3.4"
        }),
        env
      );
      const body = await response.json();

      expect(body.error).toBe("Too Many Requests");
    });

    it("allows request through when rate check passes", async () => {
      checkRateLimit.mockResolvedValue({ allowed: true });

      await app.fetch(
        makeRequest("POST", "/api/subscribe", {
          "CF-Connecting-IP": "1.2.3.4"
        }),
        env
      );

      expect(handleSubscribe).toHaveBeenCalled();
    });

    it("passes correct IP from CF-Connecting-IP to checkRateLimit", async () => {
      await app.fetch(
        makeRequest("POST", "/api/subscribe", {
          "CF-Connecting-IP": "10.0.0.1"
        }),
        env
      );

      expect(checkRateLimit).toHaveBeenCalledWith(
        env.DB,
        "10.0.0.1",
        "subscribe",
        10,
        3600
      );
    });

    it("falls back to 'unknown' IP when header is missing", async () => {
      await app.fetch(makeRequest("POST", "/api/subscribe"), env);

      expect(checkRateLimit).toHaveBeenCalledWith(
        env.DB,
        "unknown",
        "subscribe",
        expect.any(Number),
        expect.any(Number)
      );
    });

    it("rate limits /api/verify endpoint", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await app.fetch(
        makeRequest("GET", "/api/verify?token=abc", {
          "CF-Connecting-IP": "1.2.3.4"
        }),
        env
      );

      expect(response.status).toBe(429);
      expect(handleVerify).not.toHaveBeenCalled();
    });

    it("rate limits /api/unsubscribe endpoint", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await app.fetch(
        makeRequest("GET", "/api/unsubscribe?token=abc", {
          "CF-Connecting-IP": "1.2.3.4"
        }),
        env
      );

      expect(response.status).toBe(429);
      expect(handleUnsubscribe).not.toHaveBeenCalled();
    });

    it("rate limits /api/send endpoint before auth check", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await app.fetch(
        makeRequest("POST", "/api/send", {
          "CF-Connecting-IP": "1.2.3.4",
          Authorization: "Bearer test-admin-key"
        }),
        env
      );

      expect(response.status).toBe(429);
      expect(handleSend).not.toHaveBeenCalled();
    });

    it("rate limits /api/admin/* endpoints before auth check", async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await app.fetch(
        makeRequest("GET", "/api/admin/stats", {
          "CF-Connecting-IP": "1.2.3.4",
          Authorization: "Bearer test-admin-key"
        }),
        env
      );

      expect(response.status).toBe(429);
      expect(handleAdmin).not.toHaveBeenCalled();
    });

    it("does not rate limit OPTIONS requests", async () => {
      await app.fetch(
        makeRequest("OPTIONS", "/api/subscribe", {
          "CF-Connecting-IP": "1.2.3.4"
        }),
        env
      );

      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("does not rate limit non-API paths", async () => {
      await app.fetch(
        makeRequest("GET", "/", {
          "CF-Connecting-IP": "1.2.3.4"
        }),
        env
      );

      expect(checkRateLimit).not.toHaveBeenCalled();
    });
  });

  describe("trailing-slash normalization", () => {
    describe("trailing slashes are silently stripped (no redirect)", () => {
      it("handles POST /api/subscribe/ same as POST /api/subscribe", async () => {
        const request = makeRequest("POST", "/api/subscribe/");

        const response = await app.fetch(request, env);

        expect(response.status).not.toBe(301);
        expect(handleSubscribe).toHaveBeenCalledWith(request, env);
      });

      it("handles GET /api/verify/ same as GET /api/verify", async () => {
        const request = makeRequest("GET", "/api/verify/?token=abc");

        const response = await app.fetch(request, env);

        expect(response.status).not.toBe(301);
        expect(handleVerify).toHaveBeenCalledWith(
          request,
          env,
          expect.any(URL)
        );
      });

      it("preserves query string after stripping trailing slash", async () => {
        const request = makeRequest("GET", "/api/verify/?token=abc");

        await app.fetch(request, env);

        const passedUrl = handleVerify.mock.calls[0][2];
        expect(passedUrl.searchParams.get("token")).toBe("abc");
      });

      it("handles GET /api/unsubscribe/ same as GET /api/unsubscribe", async () => {
        await app.fetch(makeRequest("GET", "/api/unsubscribe/?token=xyz"), env);

        expect(handleUnsubscribe).toHaveBeenCalledWith(
          expect.any(Request),
          env,
          expect.any(URL)
        );
      });

      it("handles POST /api/unsubscribe/ same as POST /api/unsubscribe", async () => {
        await app.fetch(
          makeRequest("POST", "/api/unsubscribe/?token=xyz"),
          env
        );

        expect(handleUnsubscribe).toHaveBeenCalledWith(
          expect.any(Request),
          env,
          expect.any(URL)
        );
      });

      it("handles POST /api/send/ same as POST /api/send", async () => {
        await app.fetch(
          makeRequest("POST", "/api/send/", {
            Authorization: "Bearer test-admin-key"
          }),
          env
        );

        expect(handleSend).toHaveBeenCalledWith(expect.any(Request), env);
      });

      it("handles GET /api/admin/stats/ same as GET /api/admin/stats", async () => {
        await app.fetch(
          makeRequest("GET", "/api/admin/stats/", {
            Authorization: "Bearer test-admin-key"
          }),
          env
        );

        expect(handleAdmin).toHaveBeenCalledWith(
          expect.any(Request),
          env,
          expect.any(URL)
        );
      });

      it("strips multiple trailing slashes", async () => {
        const request = makeRequest("POST", "/api/subscribe///");

        await app.fetch(request, env);

        expect(handleSubscribe).toHaveBeenCalledWith(request, env);
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
        const responsePromise = app.fetch(
          makeRequest("GET", "/api/subscribe/"),
          env
        );
        await vi.advanceTimersByTimeAsync(10_000);
        const response = await responsePromise;

        expect(response.status).toBe(408);
        expect(handleSubscribe).not.toHaveBeenCalled();
      });

      it("returns 408 timeout for DELETE /api/verify/ (wrong method)", async () => {
        const responsePromise = app.fetch(
          makeRequest("DELETE", "/api/verify/"),
          env
        );
        await vi.advanceTimersByTimeAsync(10_000);
        const response = await responsePromise;

        expect(response.status).toBe(408);
        expect(handleVerify).not.toHaveBeenCalled();
      });
    });

    describe("bare / is not affected", () => {
      it("returns 404 for GET / (not treated differently)", async () => {
        const response = await app.fetch(makeRequest("GET", "/"), env);

        expect(response.status).toBe(404);
        expect(response.body).toBeNull();
      });
    });

    describe("unknown paths with trailing slashes still return 404", () => {
      it("returns 404 for GET /api/unknown/", async () => {
        const response = await app.fetch(
          makeRequest("GET", "/api/unknown/"),
          env
        );

        expect(response.status).toBe(404);
        expect(response.body).toBeNull();
      });

      it("returns 404 for GET /api/unknown///", async () => {
        const response = await app.fetch(
          makeRequest("GET", "/api/unknown///"),
          env
        );

        expect(response.status).toBe(404);
        expect(response.body).toBeNull();
      });
    });

    describe("normalization runs before rate limiting and auth", () => {
      it("uses the normalized pathname for rate limiting", async () => {
        await app.fetch(
          makeRequest("POST", "/api/subscribe/", {
            "CF-Connecting-IP": "1.2.3.4"
          }),
          env
        );

        expect(getEndpointName).toHaveBeenCalledWith("/api/subscribe");
      });

      it("rate limits requests with trailing slashes correctly", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("POST", "/api/subscribe/", {
            "CF-Connecting-IP": "1.2.3.4"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(handleSubscribe).not.toHaveBeenCalled();
      });
    });
  });

  describe("auth fallback to D1 credentials", () => {
    it("falls back to D1 admin_api_key when ADMIN_API_KEY env var is not set", async () => {
      // Import getCredential mock
      const { getCredential } = await import("../../src/shared/lib/db.js");

      // Remove ADMIN_API_KEY from env so it falls through to D1
      const envNoKey = { DB: {} };

      // Mock getCredential to return a key from D1
      vi.mocked(getCredential).mockResolvedValue("db-admin-key");

      const request = makeRequest("POST", "/api/send", {
        Authorization: "Bearer db-admin-key"
      });

      await app.fetch(request, envNoKey);

      expect(handleSend).toHaveBeenCalledWith(request, envNoKey);
    });

    it("returns 401 when D1 key does not match", async () => {
      const { getCredential } = await import("../../src/shared/lib/db.js");

      const envNoKey = { DB: {} };
      vi.mocked(getCredential).mockResolvedValue("db-admin-key");

      const request = makeRequest("POST", "/api/send", {
        Authorization: "Bearer wrong-key"
      });

      const response = await app.fetch(request, envNoKey);

      expect(response.status).toBe(401);
      expect(handleSend).not.toHaveBeenCalled();
    });

    it("returns 401 when neither env var nor D1 key is configured", async () => {
      const { getCredential } = await import("../../src/shared/lib/db.js");

      const envNoKey = { DB: {} };
      vi.mocked(getCredential).mockResolvedValue(null);

      const request = makeRequest("POST", "/api/send", {
        Authorization: "Bearer any-key"
      });

      const response = await app.fetch(request, envNoKey);

      expect(response.status).toBe(401);
    });

    it("returns 401 when no DB and no env var", async () => {
      const envEmpty = {};

      const request = makeRequest("POST", "/api/send", {
        Authorization: "Bearer any-key"
      });

      const response = await app.fetch(request, envEmpty);

      expect(response.status).toBe(401);
    });
  });

  describe("X-Internal-Request header — rate limit bypass for internal admin requests", () => {
    describe("defers rate limiting for internal admin requests", () => {
      it("skips rate limiting before auth for /api/admin/* with X-Internal-Request: true", async () => {
        const request = makeRequest("GET", "/api/admin/stats", {
          Authorization: "Bearer test-admin-key",
          "X-Internal-Request": "true"
        });

        await app.fetch(request, env);

        // Rate limiting should not have been called at all for authenticated internal request
        expect(checkRateLimit).not.toHaveBeenCalled();
        expect(handleAdmin).toHaveBeenCalled();
      });

      it("still rate limits /api/admin/* without the X-Internal-Request header", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            "CF-Connecting-IP": "1.2.3.4",
            Authorization: "Bearer test-admin-key"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalled();
        expect(handleAdmin).not.toHaveBeenCalled();
      });

      it("ignores X-Internal-Request header on /api/subscribe — rate limits before auth", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("POST", "/api/subscribe", {
            "CF-Connecting-IP": "1.2.3.4",
            "X-Internal-Request": "true"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalled();
        expect(handleSubscribe).not.toHaveBeenCalled();
      });

      it("ignores X-Internal-Request header on /api/send — rate limits before auth", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("POST", "/api/send", {
            "CF-Connecting-IP": "1.2.3.4",
            Authorization: "Bearer test-admin-key",
            "X-Internal-Request": "true"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalled();
        expect(handleSend).not.toHaveBeenCalled();
      });

      it("ignores X-Internal-Request header on /api/verify — rate limits normally", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("GET", "/api/verify?token=abc", {
            "CF-Connecting-IP": "1.2.3.4",
            "X-Internal-Request": "true"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalled();
        expect(handleVerify).not.toHaveBeenCalled();
      });

      it("ignores X-Internal-Request header on /api/unsubscribe — rate limits normally", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("GET", "/api/unsubscribe?token=abc", {
            "CF-Connecting-IP": "1.2.3.4",
            "X-Internal-Request": "true"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalled();
        expect(handleUnsubscribe).not.toHaveBeenCalled();
      });
    });

    describe("bypasses rate limiting on successful auth with internal header", () => {
      it("does not call checkRateLimit when auth succeeds with internal header", async () => {
        const request = makeRequest("GET", "/api/admin/channels", {
          Authorization: "Bearer test-admin-key",
          "X-Internal-Request": "true"
        });

        const response = await app.fetch(request, env);

        expect(response.status).toBe(200);
        expect(checkRateLimit).not.toHaveBeenCalled();
        expect(handleAdmin).toHaveBeenCalled();
      });

      it("allows unlimited admin console calls without hitting 429", async () => {
        // Even if rate limit would deny, authenticated internal requests skip it entirely
        const request = makeRequest("GET", "/api/admin/subscribers", {
          Authorization: "Bearer test-admin-key",
          "X-Internal-Request": "true"
        });

        const response = await app.fetch(request, env);

        expect(response.status).toBe(200);
        expect(checkRateLimit).not.toHaveBeenCalled();
      });

      it("calls handleAdmin normally after bypassing rate limit", async () => {
        const request = makeRequest("GET", "/api/admin/config", {
          Authorization: "Bearer test-admin-key",
          "X-Internal-Request": "true"
        });

        await app.fetch(request, env);

        expect(handleAdmin).toHaveBeenCalledWith(request, env, expect.any(URL));
      });

      it("bypasses rate limit for internal admin requests using D1 credentials", async () => {
        const { getCredential } = await import("../../src/shared/lib/db.js");
        const envNoKey = { DB: {} };
        vi.mocked(getCredential).mockResolvedValue("db-admin-key");

        const request = makeRequest("GET", "/api/admin/stats", {
          Authorization: "Bearer db-admin-key",
          "X-Internal-Request": "true"
        });

        await app.fetch(request, envNoKey);

        expect(checkRateLimit).not.toHaveBeenCalled();
        expect(handleAdmin).toHaveBeenCalled();
      });
    });

    describe("applies rate limiting on failed auth with internal header", () => {
      it("rate limits retroactively when auth fails with internal header", async () => {
        checkRateLimit.mockResolvedValue({ allowed: true });

        const response = await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            Authorization: "Bearer wrong-key",
            "X-Internal-Request": "true"
          }),
          env
        );

        // Auth failed, so rate limit should have been applied retroactively
        expect(checkRateLimit).toHaveBeenCalled();
        expect(response.status).toBe(401);
      });

      it("returns 429 when retroactive rate limit check denies the request", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 120 });

        const response = await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            Authorization: "Bearer wrong-key",
            "X-Internal-Request": "true"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("120");
        expect(handleAdmin).not.toHaveBeenCalled();
      });

      it("uses the admin endpoint rate limit parameters for retroactive check", async () => {
        checkRateLimit.mockResolvedValue({ allowed: true });

        await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            "CF-Connecting-IP": "10.0.0.1",
            Authorization: "Bearer wrong-key",
            "X-Internal-Request": "true"
          }),
          env
        );

        expect(checkRateLimit).toHaveBeenCalledWith(
          env.DB,
          "10.0.0.1",
          "admin",
          RATE_LIMITS.admin.maxRequests,
          RATE_LIMITS.admin.windowSeconds
        );
      });

      it("falls back to 'unknown' IP for retroactive rate limit when CF-Connecting-IP is absent", async () => {
        checkRateLimit.mockResolvedValue({ allowed: true });

        await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            Authorization: "Bearer wrong-key",
            "X-Internal-Request": "true"
          }),
          env
        );

        expect(checkRateLimit).toHaveBeenCalledWith(
          env.DB,
          "unknown",
          "admin",
          expect.any(Number),
          expect.any(Number)
        );
      });

      it("records rate limit row so repeated failures accumulate", async () => {
        // First call: allowed (but auth fails)
        checkRateLimit.mockResolvedValue({ allowed: true });

        await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            "CF-Connecting-IP": "1.2.3.4",
            Authorization: "Bearer wrong-key",
            "X-Internal-Request": "true"
          }),
          env
        );

        // checkRateLimit was called, which means a row was recorded
        expect(checkRateLimit).toHaveBeenCalledTimes(1);

        // Second call: now rate limited
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            "CF-Connecting-IP": "1.2.3.4",
            Authorization: "Bearer wrong-key",
            "X-Internal-Request": "true"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalledTimes(2);
      });
    });

    describe("header value strictness", () => {
      it("treats X-Internal-Request: false as absent — rate limits before auth", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            "CF-Connecting-IP": "1.2.3.4",
            Authorization: "Bearer test-admin-key",
            "X-Internal-Request": "false"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalled();
        expect(handleAdmin).not.toHaveBeenCalled();
      });

      it("treats empty X-Internal-Request header as absent — rate limits before auth", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            "CF-Connecting-IP": "1.2.3.4",
            Authorization: "Bearer test-admin-key",
            "X-Internal-Request": ""
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalled();
        expect(handleAdmin).not.toHaveBeenCalled();
      });

      it("treats absent X-Internal-Request header as absent — rate limits before auth", async () => {
        checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

        const response = await app.fetch(
          makeRequest("GET", "/api/admin/stats", {
            "CF-Connecting-IP": "1.2.3.4",
            Authorization: "Bearer test-admin-key"
          }),
          env
        );

        expect(response.status).toBe(429);
        expect(checkRateLimit).toHaveBeenCalled();
      });
    });
  });

  describe("admin channel route method allowance", () => {
    it("allows any method through for /api/admin/channels paths", async () => {
      const request = makeRequest("PUT", "/api/admin/channels/test", {
        Authorization: "Bearer test-admin-key"
      });

      await app.fetch(request, env);

      expect(handleAdmin).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("catches unhandled errors and returns 500", async () => {
      handleSubscribe.mockRejectedValue(new Error("Unexpected error"));

      const response = await app.fetch(
        makeRequest("POST", "/api/subscribe"),
        env
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe("Internal Server Error");
    });

    it("returns JSON content type for 500 errors", async () => {
      handleSubscribe.mockRejectedValue(new Error("Boom"));

      const response = await app.fetch(
        makeRequest("POST", "/api/subscribe"),
        env
      );

      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });
});

describe("index.js — scheduled handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkFeedsAndSend.mockResolvedValue({ sent: 0, items: [] });
  });

  it("calls checkFeedsAndSend with env via ctx.waitUntil", async () => {
    const ctx = { waitUntil: vi.fn() };
    const event = {};

    await app.scheduled(event, env, ctx);

    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    // The argument to waitUntil should be the promise from checkFeedsAndSend
    expect(checkFeedsAndSend).toHaveBeenCalledWith(env);
  });
});
