import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
  getChannelById: vi.fn(),
}));
vi.mock("../../src/lib/db.js", () => ({
  getSubscriberStats: vi.fn(),
  getSentItemStats: vi.fn(),
  getSubscriberList: vi.fn(),
}));

import { handleAdmin } from "../../src/routes/admin.js";
import { getChannelById } from "../../src/lib/config.js";
import {
  getSubscriberStats,
  getSentItemStats,
  getSubscriberList,
} from "../../src/lib/db.js";

const CHANNEL = {
  id: "test-channel",
  siteName: "Test Site",
  siteUrl: "https://test.example.com",
  feeds: [
    { name: "Main Feed", url: "https://test.example.com/feed.xml" },
  ],
};

const env = { DB: {}, DOMAIN: "test.example.com" };

function makeRequest(pathname, params = {}) {
  const url = new URL(`https://test.example.com${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return {
    request: new Request(url.toString(), { method: "GET" }),
    url,
  };
}

describe("handleAdmin — channel restructuring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelById.mockReturnValue(CHANNEL);
    getSubscriberStats.mockResolvedValue({
      total: 10,
      verified: 7,
      pending: 2,
      unsubscribed: 1,
    });
    getSentItemStats.mockResolvedValue({
      total: 5,
      lastSentAt: "2025-01-15 10:00:00",
    });
    getSubscriberList.mockResolvedValue([]);
  });

  describe("channelId replaces siteId query parameter", () => {
    it("accepts channelId query param for stats", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-channel",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("subscribers");
      expect(body).toHaveProperty("sentItems");
    });

    it("accepts channelId query param for subscribers", async () => {
      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-channel",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("subscribers");
      expect(body).toHaveProperty("count");
    });

    it("returns 400 when channelId is missing for stats", async () => {
      const { request, url } = makeRequest("/api/admin/stats");

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/channelId/i);
    });

    it("returns 400 when channelId is missing for subscribers", async () => {
      const { request, url } = makeRequest("/api/admin/subscribers");

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/channelId/i);
    });

    it("returns 404 for unknown channel", async () => {
      getChannelById.mockReturnValue(null);
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "nonexistent",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toMatch(/channel/i);
    });
  });

  describe("uses getChannelById instead of getSiteById", () => {
    it("calls getChannelById with channelId", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-channel",
      });

      await handleAdmin(request, env, url);

      expect(getChannelById).toHaveBeenCalledWith(env, "test-channel");
    });
  });

  describe("stats response uses channelId", () => {
    it("response body includes channelId (not siteId)", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-channel",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(body.channelId).toBe("test-channel");
      expect(body).not.toHaveProperty("siteId");
    });
  });

  describe("subscribers response uses channelId", () => {
    it("response body includes channelId (not siteId)", async () => {
      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-channel",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(body.channelId).toBe("test-channel");
      expect(body).not.toHaveProperty("siteId");
    });
  });

  describe("feeds are extracted as URLs from structured objects", () => {
    it("passes feed URLs to getSentItemStats from feed objects", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-channel",
      });

      await handleAdmin(request, env, url);

      // channel.feeds is [{name, url}], but getSentItemStats needs [url]
      expect(getSentItemStats).toHaveBeenCalledWith(env.DB, [
        "https://test.example.com/feed.xml",
      ]);
    });

    it("returns feed URLs in stats response from feed objects", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-channel",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      // feeds in response should be URL strings
      expect(body.feeds).toEqual(["https://test.example.com/feed.xml"]);
    });

    it("handles channel with multiple feed objects", async () => {
      const multiChannel = {
        ...CHANNEL,
        feeds: [
          { name: "Feed A", url: "https://test.example.com/feed-a.xml" },
          { name: "Feed B", url: "https://test.example.com/feed-b.xml" },
        ],
      };
      getChannelById.mockReturnValue(multiChannel);

      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-channel",
      });

      await handleAdmin(request, env, url);

      expect(getSentItemStats).toHaveBeenCalledWith(env.DB, [
        "https://test.example.com/feed-a.xml",
        "https://test.example.com/feed-b.xml",
      ]);
    });
  });

  describe("getSubscriberStats uses channelId", () => {
    it("passes channelId to getSubscriberStats", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-channel",
      });

      await handleAdmin(request, env, url);

      expect(getSubscriberStats).toHaveBeenCalledWith(env.DB, "test-channel");
    });
  });

  describe("getSubscriberList uses channelId", () => {
    it("passes channelId to getSubscriberList", async () => {
      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-channel",
      });

      await handleAdmin(request, env, url);

      expect(getSubscriberList).toHaveBeenCalledWith(
        env.DB,
        "test-channel",
        null,
      );
    });

    it("passes status filter along with channelId", async () => {
      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-channel",
        status: "verified",
      });

      await handleAdmin(request, env, url);

      expect(getSubscriberList).toHaveBeenCalledWith(
        env.DB,
        "test-channel",
        "verified",
      );
    });
  });
});
