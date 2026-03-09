import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock shared db for getCredential
vi.mock("../../../src/shared/lib/db.js", () => ({
  getCredential: vi.fn()
}));

import { callApi } from "../../../src/admin/lib/api.js";
import { getCredential } from "../../../src/shared/lib/db.js";

const mockFetch = vi.fn();

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com",
  API_SERVICE: { fetch: mockFetch }
};

describe("callApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCredential.mockResolvedValue("test-admin-api-key");
  });

  describe("URL construction", () => {
    it("constructs URL using env.DOMAIN with https protocol", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "GET", "/admin/channels");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://feedmail.example.com/api/admin/channels",
        expect.any(Object)
      );
    });

    it("constructs URL with path that includes nested segments", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "GET", "/admin/channels/test-ch/feeds");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://feedmail.example.com/api/admin/channels/test-ch/feeds",
        expect.any(Object)
      );
    });
  });

  describe("authorization header", () => {
    it("sets Authorization Bearer header with API key from D1", async () => {
      getCredential.mockResolvedValue("my-secret-key");
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "GET", "/admin/channels");

      expect(getCredential).toHaveBeenCalledWith(env.DB, "admin_api_key");
      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.headers["Authorization"]).toBe("Bearer my-secret-key");
    });
  });

  describe("request methods and body", () => {
    it("sends GET request without body", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "GET", "/admin/channels");

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
    });

    it("sends POST request with JSON body", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        })
      );

      const body = { id: "new-channel", siteName: "Test" };
      await callApi(env, "POST", "/admin/channels", body);

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.method).toBe("POST");
      expect(options.body).toBe(JSON.stringify(body));
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("sends PUT request with JSON body", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      const body = { siteName: "Updated" };
      await callApi(env, "PUT", "/admin/channels/test-ch", body);

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.method).toBe("PUT");
      expect(options.body).toBe(JSON.stringify(body));
    });

    it("sends DELETE request without body", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      await callApi(env, "DELETE", "/admin/channels/test-ch");

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.method).toBe("DELETE");
    });
  });

  describe("success responses", () => {
    it("returns { ok: true, status, data } on 200 response", async () => {
      const responseData = { channels: [{ id: "ch1" }] };
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      const result = await callApi(env, "GET", "/admin/channels");

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data).toEqual(responseData);
    });

    it("returns { ok: true, status, data } on 201 response", async () => {
      const responseData = { id: "new-ch" };
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        })
      );

      const result = await callApi(env, "POST", "/admin/channels", {
        id: "new-ch"
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe(201);
      expect(result.data).toEqual(responseData);
    });
  });

  describe("error responses", () => {
    it("returns { ok: false, status, data } on 400 response", async () => {
      const errorData = { error: "Invalid field" };
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(errorData), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        })
      );

      const result = await callApi(env, "POST", "/admin/channels", {});

      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.data).toEqual(errorData);
    });

    it("returns { ok: false, status, data } on 404 response", async () => {
      const errorData = { error: "Channel not found" };
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(errorData), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        })
      );

      const result = await callApi(env, "GET", "/admin/channels/nonexistent");

      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      expect(result.data).toEqual(errorData);
    });

    it("returns { ok: false, status, data } on 409 response", async () => {
      const errorData = { error: "Channel ID already exists" };
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(errorData), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        })
      );

      const result = await callApi(env, "POST", "/admin/channels", {
        id: "existing"
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
      expect(result.data).toEqual(errorData);
    });

    it("returns { ok: false, status, data } on 429 response", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: "Too Many Requests" }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60"
          }
        })
      );

      const result = await callApi(env, "POST", "/send");

      expect(result.ok).toBe(false);
      expect(result.status).toBe(429);
    });
  });

  describe("fetch failures", () => {
    it("handles network error gracefully when API is unreachable", async () => {
      mockFetch.mockRejectedValue(new Error("fetch failed"));

      const result = await callApi(env, "GET", "/admin/channels");

      expect(result.ok).toBe(false);
      expect(result.data).toBeDefined();
      expect(result.data.error).toBeDefined();
    });

    it("handles DNS resolution failure gracefully", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await callApi(env, "GET", "/admin/stats");

      expect(result.ok).toBe(false);
    });
  });

  describe("non-JSON responses", () => {
    it("handles non-JSON response body gracefully", async () => {
      mockFetch.mockResolvedValue(
        new Response("Internal Server Error", {
          status: 500,
          headers: { "Content-Type": "text/plain" }
        })
      );

      const result = await callApi(env, "GET", "/admin/channels");

      expect(result.ok).toBe(false);
      expect(result.status).toBe(500);
    });

    it("handles empty response body (204 No Content)", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      const result = await callApi(env, "DELETE", "/admin/channels/test");

      expect(result.ok).toBe(true);
      expect(result.status).toBe(204);
    });
  });

  describe("missing admin_api_key", () => {
    it("returns error when admin_api_key is not configured in D1", async () => {
      getCredential.mockResolvedValue(null);

      const result = await callApi(env, "GET", "/admin/channels");

      expect(result.ok).toBe(false);
      expect(result.data.error).toBeDefined();
      // Should not make a fetch call without an API key
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("X-Internal-Request header", () => {
    it("includes X-Internal-Request header set to 'true' on GET requests", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "GET", "/admin/channels");

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.headers["X-Internal-Request"]).toBe("true");
    });

    it("includes X-Internal-Request header set to 'true' on POST requests", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "POST", "/admin/channels", { id: "ch1" });

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.headers["X-Internal-Request"]).toBe("true");
    });

    it("includes X-Internal-Request header set to 'true' on PUT requests", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "PUT", "/admin/channels/test-ch", {
        siteName: "Updated"
      });

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.headers["X-Internal-Request"]).toBe("true");
    });

    it("includes X-Internal-Request header set to 'true' on DELETE requests", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      await callApi(env, "DELETE", "/admin/channels/test-ch");

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.headers["X-Internal-Request"]).toBe("true");
    });

    it("includes X-Internal-Request header set to 'true' on PATCH requests", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "PATCH", "/admin/config", { verify_max_attempts: 5 });

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      expect(options.headers["X-Internal-Request"]).toBe("true");
    });

    it("header value is the literal string 'true'", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "GET", "/admin/stats");

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      // Must be exactly the string "true", not a boolean or other value
      expect(options.headers["X-Internal-Request"]).toBe("true");
      expect(typeof options.headers["X-Internal-Request"]).toBe("string");
    });

    it("does not include sensitive information in the header value", async () => {
      getCredential.mockResolvedValue("secret-api-key-12345");
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      await callApi(env, "GET", "/admin/channels");

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1];
      // The header value must not contain any credential or session information
      expect(options.headers["X-Internal-Request"]).toBe("true");
      expect(options.headers["X-Internal-Request"]).not.toContain(
        "secret-api-key-12345"
      );
    });

    it("does not make fetch when admin_api_key is missing so header is irrelevant", async () => {
      getCredential.mockResolvedValue(null);

      await callApi(env, "GET", "/admin/channels");

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
