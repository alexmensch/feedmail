import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/shared/lib/db.js", () => ({
  getSiteConfig: vi.fn(),
  upsertSiteConfig: vi.fn(),
  getRateLimitConfigs: vi.fn(),
  upsertRateLimitConfig: vi.fn()
}));

import { handleAdminConfig } from "../../../src/api/routes/admin-config.js";
import {
  getSiteConfig,
  upsertSiteConfig,
  getRateLimitConfigs,
  upsertRateLimitConfig
} from "../../../src/shared/lib/db.js";

const env = { DB: {} };

function makeRequest(method, body = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return new Request("https://feedmail.cc/api/admin/config", options);
}

describe("handleAdminConfig", () => {
  describe("method not allowed", () => {
    it("returns 405 for unsupported methods", async () => {
      const request = makeRequest("DELETE");
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(response.status).toBe(405);
      expect(body.error).toBe("Method Not Allowed");
    });

    it("returns 405 for PUT", async () => {
      const request = makeRequest("PUT", { verifyMaxAttempts: 5 });
      const response = await handleAdminConfig(request, env);

      expect(response.status).toBe(405);
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getSiteConfig.mockResolvedValue({
      verifyMaxAttempts: 3,
      verifyWindowHours: 24
    });
    getRateLimitConfigs.mockResolvedValue({
      subscribe: { windowHours: 1, maxRequests: 10 },
      verify: { windowHours: 1, maxRequests: 20 },
      unsubscribe: { windowHours: 1, maxRequests: 20 },
      send: { windowHours: 1, maxRequests: 5 },
      admin: { windowHours: 1, maxRequests: 30 }
    });
  });

  describe("GET /api/admin/config", () => {
    it("returns current site settings and rate limit config", async () => {
      const request = makeRequest("GET");
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("verifyMaxAttempts", 3);
      expect(body).toHaveProperty("verifyWindowHours", 24);
      expect(body).toHaveProperty("rateLimits");
    });

    it("returns rate limits as a map of per-endpoint configs", async () => {
      const request = makeRequest("GET");
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(body.rateLimits).toHaveProperty("subscribe");
      expect(body.rateLimits).toHaveProperty("verify");
      expect(body.rateLimits).toHaveProperty("unsubscribe");
      expect(body.rateLimits).toHaveProperty("send");
      expect(body.rateLimits).toHaveProperty("admin");
      expect(body.rateLimits.subscribe).toEqual({
        windowHours: 1,
        maxRequests: 10
      });
    });

    it("reads site config from the database", async () => {
      const request = makeRequest("GET");
      await handleAdminConfig(request, env);

      expect(getSiteConfig).toHaveBeenCalledWith(env.DB);
    });

    it("reads rate limit config from the database", async () => {
      const request = makeRequest("GET");
      await handleAdminConfig(request, env);

      expect(getRateLimitConfigs).toHaveBeenCalledWith(env.DB);
    });

    it("returns hardcoded defaults when site_config table is empty", async () => {
      getSiteConfig.mockResolvedValue(null);
      const request = makeRequest("GET");
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.verifyMaxAttempts).toBe(3);
      expect(body.verifyWindowHours).toBe(24);
    });

    it("returns hardcoded defaults when rate_limit_config table is empty", async () => {
      getRateLimitConfigs.mockResolvedValue({});
      const request = makeRequest("GET");
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.rateLimits).toBeDefined();
      // Should fall back to hardcoded defaults for missing endpoints
      expect(body.rateLimits.subscribe).toBeDefined();
      expect(body.rateLimits.subscribe.maxRequests).toBeGreaterThan(0);
    });
  });

  describe("PATCH /api/admin/config", () => {
    it("updates verify_max_attempts only (partial update)", async () => {
      upsertSiteConfig.mockResolvedValue({});
      getSiteConfig.mockResolvedValue({
        verifyMaxAttempts: 5,
        verifyWindowHours: 24
      });

      const request = makeRequest("PATCH", { verifyMaxAttempts: 5 });
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(upsertSiteConfig).toHaveBeenCalled();
      expect(body.verifyMaxAttempts).toBe(5);
    });

    it("updates verify_window_hours only (partial update)", async () => {
      upsertSiteConfig.mockResolvedValue({});
      getSiteConfig.mockResolvedValue({
        verifyMaxAttempts: 3,
        verifyWindowHours: 48
      });

      const request = makeRequest("PATCH", { verifyWindowHours: 48 });
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.verifyWindowHours).toBe(48);
    });

    it("updates both verify settings at once", async () => {
      upsertSiteConfig.mockResolvedValue({});
      getSiteConfig.mockResolvedValue({
        verifyMaxAttempts: 10,
        verifyWindowHours: 48
      });

      const request = makeRequest("PATCH", {
        verifyMaxAttempts: 10,
        verifyWindowHours: 48
      });
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.verifyMaxAttempts).toBe(10);
      expect(body.verifyWindowHours).toBe(48);
    });

    it("updates rate limit config for a single endpoint", async () => {
      upsertRateLimitConfig.mockResolvedValue({});

      const request = makeRequest("PATCH", {
        rateLimits: {
          subscribe: { windowHours: 2, maxRequests: 20 }
        }
      });
      const response = await handleAdminConfig(request, env);

      expect(response.status).toBe(200);
      expect(upsertRateLimitConfig).toHaveBeenCalledWith(
        env.DB,
        "subscribe",
        expect.objectContaining({ windowHours: 2, maxRequests: 20 })
      );
    });

    it("updates rate limit config for multiple endpoints", async () => {
      upsertRateLimitConfig.mockResolvedValue({});

      const request = makeRequest("PATCH", {
        rateLimits: {
          subscribe: { windowHours: 2, maxRequests: 20 },
          admin: { windowHours: 0.5, maxRequests: 60 }
        }
      });
      const response = await handleAdminConfig(request, env);

      expect(response.status).toBe(200);
      expect(upsertRateLimitConfig).toHaveBeenCalledTimes(2);
    });

    it("returns updated config after patch", async () => {
      upsertSiteConfig.mockResolvedValue({});
      getSiteConfig.mockResolvedValue({
        verifyMaxAttempts: 5,
        verifyWindowHours: 24
      });
      getRateLimitConfigs.mockResolvedValue({
        subscribe: { windowHours: 1, maxRequests: 10 },
        verify: { windowHours: 1, maxRequests: 20 },
        unsubscribe: { windowHours: 1, maxRequests: 20 },
        send: { windowHours: 1, maxRequests: 5 },
        admin: { windowHours: 1, maxRequests: 30 }
      });

      const request = makeRequest("PATCH", { verifyMaxAttempts: 5 });
      const response = await handleAdminConfig(request, env);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("verifyMaxAttempts");
      expect(body).toHaveProperty("verifyWindowHours");
      expect(body).toHaveProperty("rateLimits");
    });

    describe("validation", () => {
      it("rejects non-numeric verifyMaxAttempts", async () => {
        const request = makeRequest("PATCH", { verifyMaxAttempts: "abc" });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects zero verifyMaxAttempts", async () => {
        const request = makeRequest("PATCH", { verifyMaxAttempts: 0 });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects negative verifyMaxAttempts", async () => {
        const request = makeRequest("PATCH", { verifyMaxAttempts: -1 });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects non-integer verifyMaxAttempts", async () => {
        const request = makeRequest("PATCH", { verifyMaxAttempts: 3.5 });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects non-numeric verifyWindowHours", async () => {
        const request = makeRequest("PATCH", { verifyWindowHours: "abc" });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects zero verifyWindowHours", async () => {
        const request = makeRequest("PATCH", { verifyWindowHours: 0 });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects negative verifyWindowHours", async () => {
        const request = makeRequest("PATCH", { verifyWindowHours: -12 });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("accepts positive decimal verifyWindowHours", async () => {
        upsertSiteConfig.mockResolvedValue({});
        getSiteConfig.mockResolvedValue({
          verifyMaxAttempts: 3,
          verifyWindowHours: 0.5
        });

        const request = makeRequest("PATCH", { verifyWindowHours: 0.5 });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(200);
      });

      it("rejects non-numeric rate limit maxRequests", async () => {
        const request = makeRequest("PATCH", {
          rateLimits: {
            subscribe: { windowHours: 1, maxRequests: "many" }
          }
        });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects zero rate limit maxRequests", async () => {
        const request = makeRequest("PATCH", {
          rateLimits: {
            subscribe: { windowHours: 1, maxRequests: 0 }
          }
        });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects negative rate limit maxRequests", async () => {
        const request = makeRequest("PATCH", {
          rateLimits: {
            subscribe: { windowHours: 1, maxRequests: -5 }
          }
        });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects non-numeric rate limit windowHours", async () => {
        const request = makeRequest("PATCH", {
          rateLimits: {
            subscribe: { windowHours: "forever", maxRequests: 10 }
          }
        });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects zero rate limit windowHours", async () => {
        const request = makeRequest("PATCH", {
          rateLimits: {
            subscribe: { windowHours: 0, maxRequests: 10 }
          }
        });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects negative rate limit windowHours", async () => {
        const request = makeRequest("PATCH", {
          rateLimits: {
            subscribe: { windowHours: -1, maxRequests: 10 }
          }
        });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects unknown endpoint name in rate limits", async () => {
        const request = makeRequest("PATCH", {
          rateLimits: {
            nonexistent: { windowHours: 1, maxRequests: 10 }
          }
        });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("rejects invalid JSON body", async () => {
        const request = new Request("https://feedmail.cc/api/admin/config", {
          method: "PATCH",
          body: "not json"
        });
        const response = await handleAdminConfig(request, env);

        expect(response.status).toBe(400);
      });

      it("returns error message in response body on validation failure", async () => {
        const request = makeRequest("PATCH", { verifyMaxAttempts: -1 });
        const response = await handleAdminConfig(request, env);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
      });
    });
  });
});
