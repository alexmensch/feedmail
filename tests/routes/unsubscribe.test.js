import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
  getChannelById: vi.fn(),
}));
vi.mock("../../src/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>rendered</html>"),
}));
vi.mock("../../src/lib/db.js", () => ({
  getSubscriberByUnsubscribeToken: vi.fn(),
  markSubscriberUnsubscribed: vi.fn(),
}));

import { handleUnsubscribe } from "../../src/routes/unsubscribe.js";
import { getChannelById } from "../../src/lib/config.js";
import { render } from "../../src/lib/templates.js";
import {
  getSubscriberByUnsubscribeToken,
  markSubscriberUnsubscribed,
} from "../../src/lib/db.js";

const CHANNEL = {
  id: "test-channel",
  siteName: "Test Site",
  siteUrl: "https://test.example.com",
};

const env = { DB: {}, DOMAIN: "test.example.com" };

function makeUrl(token) {
  const url = new URL("https://test.example.com/api/unsubscribe");
  if (token !== undefined) url.searchParams.set("token", token);
  return url;
}

function makeRequest(method = "GET") {
  return new Request("https://test.example.com/api/unsubscribe", { method });
}

describe("handleUnsubscribe — channel restructuring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelById.mockReturnValue(CHANNEL);
  });

  describe("uses channel_id instead of site_id", () => {
    it("reads subscriber.channel_id to look up channel", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-channel",
      });

      await handleUnsubscribe(makeRequest(), env, makeUrl("valid-token"));

      expect(getChannelById).toHaveBeenCalledWith(env, "test-channel");
    });

    it("does not access subscriber.site_id", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-channel",
      });

      await handleUnsubscribe(makeRequest(), env, makeUrl("valid-token"));

      // getChannelById should be called with "test-channel", not undefined
      expect(getChannelById).toHaveBeenCalledWith(env, "test-channel");
    });
  });

  describe("uses getChannelById instead of getSiteById", () => {
    it("renders unsubscribe page with channel.siteName and channel.siteUrl", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-channel",
      });

      await handleUnsubscribe(makeRequest("GET"), env, makeUrl("valid-token"));

      expect(render).toHaveBeenCalledWith("unsubscribePage", {
        siteName: "Test Site",
        siteUrl: "https://test.example.com",
      });
    });

    it("uses fallback when channel not found in config", async () => {
      getChannelById.mockReturnValue(null);
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "unknown-channel",
      });

      await handleUnsubscribe(makeRequest("GET"), env, makeUrl("valid-token"));

      expect(render).toHaveBeenCalledWith("unsubscribePage", {
        siteName: "the newsletter",
        siteUrl: "/",
      });
    });
  });

  describe("POST response (RFC 8058) with channel_id", () => {
    it("marks subscriber as unsubscribed using channel_id subscriber", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-channel",
      });

      const response = await handleUnsubscribe(
        makeRequest("POST"),
        env,
        makeUrl("valid-token"),
      );
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toBe("OK");
      expect(markSubscriberUnsubscribed).toHaveBeenCalledWith(env.DB, 42);
    });
  });

  describe("no feedmail.cc references in test URLs", () => {
    it("test URLs use test.example.com", async () => {
      getSubscriberByUnsubscribeToken.mockResolvedValue({
        id: 42,
        status: "verified",
        channel_id: "test-channel",
      });

      const response = await handleUnsubscribe(
        makeRequest("GET"),
        env,
        makeUrl("valid-token"),
      );

      expect(response.status).toBe(200);
    });
  });
});
