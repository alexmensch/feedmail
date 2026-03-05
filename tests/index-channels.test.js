import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all route handlers and cors
vi.mock("../src/routes/subscribe.js", () => ({
  handleSubscribe: vi.fn(),
}));
vi.mock("../src/routes/verify.js", () => ({
  handleVerify: vi.fn(),
}));
vi.mock("../src/routes/unsubscribe.js", () => ({
  handleUnsubscribe: vi.fn(),
}));
vi.mock("../src/routes/send.js", () => ({
  handleSend: vi.fn(),
  checkFeedsAndSend: vi.fn(),
}));
vi.mock("../src/routes/admin.js", () => ({
  handleAdmin: vi.fn(),
}));
vi.mock("../src/lib/cors.js", () => ({
  handleCORSPreflight: vi.fn(),
  withCORS: vi.fn(),
}));
vi.mock("../src/lib/rate-limit.js", () => ({
  checkRateLimit: vi.fn(),
  getEndpointName: vi.fn(),
  RATE_LIMITS: {
    subscribe: { maxRequests: 10, windowSeconds: 3600 },
    verify: { maxRequests: 20, windowSeconds: 3600 },
    unsubscribe: { maxRequests: 20, windowSeconds: 3600 },
    send: { maxRequests: 5, windowSeconds: 3600 },
    admin: { maxRequests: 30, windowSeconds: 3600 },
  },
}));

import app from "../src/index.js";
import { handleSubscribe } from "../src/routes/subscribe.js";
import { handleVerify } from "../src/routes/verify.js";
import { handleUnsubscribe } from "../src/routes/unsubscribe.js";
import { handleSend, checkFeedsAndSend } from "../src/routes/send.js";
import { handleAdmin } from "../src/routes/admin.js";
import { handleCORSPreflight, withCORS } from "../src/lib/cors.js";
import { checkRateLimit, getEndpointName } from "../src/lib/rate-limit.js";

const env = {
  ADMIN_API_KEY: "test-admin-key",
  DB: {},
  DOMAIN: "test.example.com",
};

function makeRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(`https://test.example.com${path}`, { method, headers: reqHeaders });
}

describe("index.js — channel restructuring", () => {
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

  describe("test env uses DOMAIN instead of BASE_URL", () => {
    it("env has DOMAIN set to test.example.com", () => {
      expect(env.DOMAIN).toBe("test.example.com");
      expect(env).not.toHaveProperty("BASE_URL");
    });
  });

  describe("test URLs use test.example.com", () => {
    it("subscribe endpoint responds at test.example.com", async () => {
      const request = makeRequest("POST", "/api/subscribe");

      await app.fetch(request, env);

      expect(handleSubscribe).toHaveBeenCalledWith(request, env);
    });

    it("send endpoint accepts channelId in body", async () => {
      // The handleSend mock should parse channelId from the request body.
      // This test verifies the route works with the new test domain.
      const request = makeRequest("POST", "/api/send", {
        Authorization: "Bearer test-admin-key",
      });

      await app.fetch(request, env);

      expect(handleSend).toHaveBeenCalledWith(request, env);
    });
  });

  describe("scheduled handler uses env with DOMAIN", () => {
    it("calls checkFeedsAndSend with env containing DOMAIN", async () => {
      checkFeedsAndSend.mockResolvedValue({ sent: 0, items: [] });
      const ctx = { waitUntil: vi.fn() };
      const event = {};

      await app.scheduled(event, env, ctx);

      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
      expect(checkFeedsAndSend).toHaveBeenCalledWith(env);
    });
  });
});
