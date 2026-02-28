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

import app from "../src/index.js";
import { handleSubscribe } from "../src/routes/subscribe.js";
import { handleVerify } from "../src/routes/verify.js";
import { handleUnsubscribe } from "../src/routes/unsubscribe.js";
import { handleSend, checkFeedsAndSend } from "../src/routes/send.js";
import { handleAdmin } from "../src/routes/admin.js";
import { handleCORSPreflight, withCORS } from "../src/lib/cors.js";

const env = {
  ADMIN_API_KEY: "test-admin-key",
};

function makeRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(`https://feedmail.cc${path}`, { method, headers: reqHeaders });
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
  });

  describe("POST /api/subscribe", () => {
    it("delegates to handleSubscribe and wraps with CORS", async () => {
      const request = makeRequest("POST", "/api/subscribe");

      await app.fetch(request, env);

      expect(handleSubscribe).toHaveBeenCalledWith(request, env);
      expect(withCORS).toHaveBeenCalled();
    });

    it("does not match GET /api/subscribe", async () => {
      const response = await app.fetch(
        makeRequest("GET", "/api/subscribe"),
        env,
      );

      expect(handleSubscribe).not.toHaveBeenCalled();
      expect(response.status).toBe(404);
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

    it("does not match POST /api/verify", async () => {
      const response = await app.fetch(
        makeRequest("POST", "/api/verify"),
        env,
      );

      expect(handleVerify).not.toHaveBeenCalled();
      expect(response.status).toBe(404);
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

    it("accepts any HTTP method (PUT, DELETE, etc.)", async () => {
      await app.fetch(makeRequest("PUT", "/api/unsubscribe?token=abc"), env);
      expect(handleUnsubscribe).toHaveBeenCalled();

      vi.clearAllMocks();
      handleUnsubscribe.mockResolvedValue(new Response("OK"));

      await app.fetch(
        makeRequest("DELETE", "/api/unsubscribe?token=abc"),
        env,
      );
      expect(handleUnsubscribe).toHaveBeenCalled();
    });

    it("passes url to handleUnsubscribe", async () => {
      await app.fetch(
        makeRequest("GET", "/api/unsubscribe?token=xyz"),
        env,
      );
      expect(handleUnsubscribe).toHaveBeenCalledWith(
        expect.any(Request),
        env,
        expect.any(URL),
      );
    });
  });

  describe("POST /api/send (authenticated)", () => {
    it("delegates to handleSend with valid auth", async () => {
      const request = makeRequest("POST", "/api/send", {
        Authorization: "Bearer test-admin-key",
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
          Authorization: "Bearer wrong-key",
        }),
        env,
      );

      expect(response.status).toBe(401);
      expect(handleSend).not.toHaveBeenCalled();
    });

    it("does not match GET /api/send", async () => {
      const response = await app.fetch(
        makeRequest("GET", "/api/send", {
          Authorization: "Bearer test-admin-key",
        }),
        env,
      );

      expect(handleSend).not.toHaveBeenCalled();
      expect(response.status).toBe(404);
    });
  });

  describe("/api/admin/* (authenticated)", () => {
    it("delegates to handleAdmin with valid auth", async () => {
      const request = makeRequest("GET", "/api/admin/stats?siteId=test", {
        Authorization: "Bearer test-admin-key",
      });

      await app.fetch(request, env);

      expect(handleAdmin).toHaveBeenCalledWith(request, env, expect.any(URL));
    });

    it("returns 401 without auth for admin routes", async () => {
      const response = await app.fetch(
        makeRequest("GET", "/api/admin/stats"),
        env,
      );

      expect(response.status).toBe(401);
      expect(handleAdmin).not.toHaveBeenCalled();
    });

    it("matches any path starting with /api/admin/", async () => {
      await app.fetch(
        makeRequest("GET", "/api/admin/anything", {
          Authorization: "Bearer test-admin-key",
        }),
        env,
      );

      expect(handleAdmin).toHaveBeenCalled();
    });

    it("handles case-insensitive Bearer prefix", async () => {
      await app.fetch(
        makeRequest("GET", "/api/admin/stats?siteId=test", {
          Authorization: "bearer test-admin-key",
        }),
        env,
      );

      expect(handleAdmin).toHaveBeenCalled();
    });

    it("handles Bearer with extra whitespace", async () => {
      await app.fetch(
        makeRequest("GET", "/api/admin/stats?siteId=test", {
          Authorization: "Bearer   test-admin-key",
        }),
        env,
      );

      expect(handleAdmin).toHaveBeenCalled();
    });
  });

  describe("404 Not Found", () => {
    it("returns 404 for unmatched paths", async () => {
      const response = await app.fetch(makeRequest("GET", "/unknown"), env);

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns 404 for root path", async () => {
      const response = await app.fetch(makeRequest("GET", "/"), env);
      expect(response.status).toBe(404);
    });

    it("returns 404 for wrong method on matched paths", async () => {
      // GET on subscribe (only POST allowed)
      const r1 = await app.fetch(makeRequest("GET", "/api/subscribe"), env);
      expect(r1.status).toBe(404);

      // POST on verify (only GET allowed)
      const r2 = await app.fetch(makeRequest("POST", "/api/verify"), env);
      expect(r2.status).toBe(404);
    });
  });

  describe("error handling", () => {
    it("catches unhandled errors and returns 500", async () => {
      handleSubscribe.mockRejectedValue(new Error("Unexpected error"));

      const response = await app.fetch(
        makeRequest("POST", "/api/subscribe"),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe("Internal Server Error");
    });

    it("returns JSON content type for 500 errors", async () => {
      handleSubscribe.mockRejectedValue(new Error("Boom"));

      const response = await app.fetch(
        makeRequest("POST", "/api/subscribe"),
        env,
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
