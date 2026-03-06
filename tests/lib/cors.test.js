import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock config.js to control allowed origins
vi.mock("../../src/lib/config.js", () => ({
  getAllCorsOrigins: vi.fn(),
}));

import { handleCORSPreflight, withCORS } from "../../src/lib/cors.js";
import { getAllCorsOrigins } from "../../src/lib/config.js";

function makeRequest(origin) {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return new Request("https://feedmail.cc/api/subscribe", {
    method: "OPTIONS",
    headers,
  });
}

const env = {};

describe("cors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleCORSPreflight", () => {
    it("returns 204 with CORS headers for allowed origin", async () => {
      getAllCorsOrigins.mockReturnValue(["https://example.com"]);
      const request = makeRequest("https://example.com");

      const response = await handleCORSPreflight(request, env);

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com",
      );
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );
      expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    });

    it("returns 403 for disallowed origin", async () => {
      getAllCorsOrigins.mockReturnValue(["https://example.com"]);
      const request = makeRequest("https://evil.com");

      const response = await handleCORSPreflight(request, env);

      expect(response.status).toBe(403);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("returns 403 when no Origin header is present", async () => {
      getAllCorsOrigins.mockReturnValue(["https://example.com"]);
      const request = makeRequest(null);

      const response = await handleCORSPreflight(request, env);

      expect(response.status).toBe(403);
    });

    it("returns 403 when allowed origins list is empty", async () => {
      getAllCorsOrigins.mockReturnValue([]);
      const request = makeRequest("https://example.com");

      const response = await handleCORSPreflight(request, env);

      expect(response.status).toBe(403);
    });
  });

  describe("withCORS", () => {
    it("adds CORS header to response for allowed origin", async () => {
      getAllCorsOrigins.mockReturnValue(["https://example.com"]);
      const request = makeRequest("https://example.com");
      const original = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const response = await withCORS(original, request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com",
      );
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("returns original response unchanged for disallowed origin", async () => {
      getAllCorsOrigins.mockReturnValue(["https://example.com"]);
      const request = makeRequest("https://evil.com");
      const original = new Response("test", { status: 200 });

      const response = await withCORS(original, request, env);

      expect(response).toBe(original); // same reference
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("returns original response when no Origin header", async () => {
      getAllCorsOrigins.mockReturnValue(["https://example.com"]);
      const request = makeRequest(null);
      const original = new Response("test", { status: 200 });

      const response = await withCORS(original, request, env);

      expect(response).toBe(original);
    });

    it("preserves original response status and statusText", async () => {
      getAllCorsOrigins.mockReturnValue(["https://example.com"]);
      const request = makeRequest("https://example.com");
      const original = new Response("created", { status: 201 });

      const response = await withCORS(original, request, env);

      expect(response.status).toBe(201);
    });

    it("creates a new Response object (does not mutate original)", async () => {
      getAllCorsOrigins.mockReturnValue(["https://example.com"]);
      const request = makeRequest("https://example.com");
      const original = new Response("test", { status: 200 });

      const response = await withCORS(original, request, env);

      expect(response).not.toBe(original);
      expect(original.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });
});
