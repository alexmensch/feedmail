import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/shared/lib/config.js", () => ({
  getChannelById: vi.fn()
}));
vi.mock("../../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>rendered</html>"),
  renderErrorPage: vi.fn().mockImplementation(
    () =>
      new Response("<html>error</html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));
vi.mock("../../../src/shared/lib/db.js", () => ({
  getSubscriberByUnsubscribeToken: vi.fn(),
  markSubscriberUnsubscribed: vi.fn()
}));

import { handleUnsubscribe } from "../../../src/api/routes/unsubscribe.js";
import { getChannelById } from "../../../src/shared/lib/config.js";
import { render, renderErrorPage } from "../../../src/shared/lib/templates.js";
import {
  getSubscriberByUnsubscribeToken,
  markSubscriberUnsubscribed
} from "../../../src/shared/lib/db.js";

const CHANNEL = {
  id: "test-site",
  siteName: "Test Site",
  siteUrl: "https://example.com"
};

const env = { DB: {} };

function makeUrl(token) {
  const url = new URL("https://test.example.com/api/unsubscribe");
  if (token !== undefined) {
    url.searchParams.set("token", token);
  }
  return url;
}

function makeRequest(method = "GET") {
  return new Request("https://test.example.com/api/unsubscribe", { method });
}

describe("handleUnsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelById.mockReturnValue(CHANNEL);
  });

  describe("missing or invalid token", () => {
    it("returns error page when token is missing", async () => {
      const url = new URL("https://test.example.com/api/unsubscribe");

      const response = await handleUnsubscribe(makeRequest(), env, url);

      expect(response.status).toBe(200);
      expect(renderErrorPage).toHaveBeenCalledWith(
        env,
        null,
        "Invalid unsubscribe link."
      );
    });

    it("returns error page when subscriber not found", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue(null);

      const response = await handleUnsubscribe(
        makeRequest(),
        env,
        makeUrl("invalid-token")
      );

      expect(response.status).toBe(200);
      expect(renderErrorPage).toHaveBeenCalledWith(
        env,
        null,
        "Invalid unsubscribe link."
      );
    });

    it("error page uses fallback site info", async () => {
      await handleUnsubscribe(
        makeRequest(),
        env,
        new URL("https://test.example.com/api/unsubscribe")
      );

      expect(renderErrorPage).toHaveBeenCalledWith(
        env,
        null,
        "Invalid unsubscribe link."
      );
    });
  });

  describe("successful unsubscribe", () => {
    const subscriber = {
      id: 42,
      status: "verified",
      channel_id: "test-site"
    };

    it("marks verified subscriber as unsubscribed", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue(subscriber);

      await handleUnsubscribe(makeRequest(), env, makeUrl("valid-token"));

      expect(markSubscriberUnsubscribed).toHaveBeenCalledWith(env.DB, 42);
    });

    it("marks pending subscriber as unsubscribed", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        ...subscriber,
        status: "pending"
      });

      await handleUnsubscribe(makeRequest(), env, makeUrl("valid-token"));

      expect(markSubscriberUnsubscribed).toHaveBeenCalledWith(env.DB, 42);
    });

    it("is idempotent — does not call DB for already-unsubscribed", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        ...subscriber,
        status: "unsubscribed"
      });

      await handleUnsubscribe(makeRequest(), env, makeUrl("valid-token"));

      expect(markSubscriberUnsubscribed).not.toHaveBeenCalled();
    });
  });

  describe("GET response", () => {
    it("returns HTML page for GET requests", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-site"
      });

      const response = await handleUnsubscribe(
        makeRequest("GET"),
        env,
        makeUrl("valid-token")
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/html; charset=utf-8"
      );
      expect(render).toHaveBeenCalledWith("unsubscribePage", {
        siteName: "Test Site",
        siteUrl: "https://example.com"
      });
    });
  });

  describe("POST response (RFC 8058)", () => {
    it("returns plain text OK for POST requests", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-site"
      });

      const response = await handleUnsubscribe(
        makeRequest("POST"),
        env,
        makeUrl("valid-token")
      );
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toBe("OK");
    });

    it("marks as unsubscribed before returning OK", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-site"
      });

      await handleUnsubscribe(makeRequest("POST"), env, makeUrl("valid-token"));

      expect(markSubscriberUnsubscribed).toHaveBeenCalledWith(env.DB, 42);
    });
  });

  describe("site fallbacks", () => {
    it("uses fallback when site not found in config", async () => {
      getChannelById.mockReturnValue(null);
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "unknown-site"
      });

      await handleUnsubscribe(makeRequest("GET"), env, makeUrl("valid-token"));

      expect(render).toHaveBeenCalledWith("unsubscribePage", {
        siteName: "the newsletter",
        siteUrl: "/"
      });
    });
  });

  describe("other HTTP methods", () => {
    it("accepts PUT method (any non-POST returns HTML page)", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-site"
      });

      const response = await handleUnsubscribe(
        new Request("https://test.example.com/api/unsubscribe", {
          method: "PUT"
        }),
        env,
        makeUrl("valid-token")
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/html; charset=utf-8"
      );
    });
  });
});
