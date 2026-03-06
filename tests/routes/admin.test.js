import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/config.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getChannelById: vi.fn(),
  };
});
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
  id: "test-site",
  siteName: "Test Site",
  siteUrl: "https://example.com",
  feeds: [{ name: "Main Feed", url: "https://example.com/feed.xml" }],
};

const env = { DB: {} };

function makeRequest(pathname, params = {}) {
  const url = new URL(`https://feedmail.cc${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return {
    request: new Request(url.toString(), { method: "GET" }),
    url,
  };
}

describe("handleAdmin", () => {
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

  describe("routing", () => {
    it("routes /api/admin/stats to stats handler", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-site",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("subscribers");
      expect(body).toHaveProperty("sentItems");
    });

    it("routes /api/admin/subscribers to subscribers handler", async () => {
      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-site",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("subscribers");
      expect(body).toHaveProperty("count");
    });

    it("returns 404 for unknown admin path", async () => {
      const { request, url } = makeRequest("/api/admin/unknown");

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("handleStats", () => {
    it("returns 400 when siteId is missing", async () => {
      const { request, url } = makeRequest("/api/admin/stats");

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing channelId query parameter");
    });

    it("returns 404 for unknown site", async () => {
      getChannelById.mockReturnValue(null);
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "nonexistent",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe("Unknown channel");
    });

    it("returns subscriber and sent item stats", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-site",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.channelId).toBe("test-site");
      expect(body.subscribers).toEqual({
        total: 10,
        verified: 7,
        pending: 2,
        unsubscribed: 1,
      });
      expect(body.sentItems).toEqual({
        total: 5,
        lastSentAt: "2025-01-15 10:00:00",
      });
      expect(body.feeds).toEqual([{ name: "Main Feed", url: "https://example.com/feed.xml" }]);
    });

    it("calls getSubscriberStats and getSentItemStats in parallel", async () => {
      const { request, url } = makeRequest("/api/admin/stats", {
        channelId: "test-site",
      });

      await handleAdmin(request, env, url);

      expect(getSubscriberStats).toHaveBeenCalledWith(env.DB, "test-site");
      expect(getSentItemStats).toHaveBeenCalledWith(env.DB, [
        "https://example.com/feed.xml",
      ]);
    });
  });

  describe("handleSubscribers", () => {
    it("returns 400 when siteId is missing", async () => {
      const { request, url } = makeRequest("/api/admin/subscribers");

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Missing channelId query parameter");
    });

    it("returns 404 for unknown site", async () => {
      getChannelById.mockReturnValue(null);
      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "nonexistent",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe("Unknown channel");
    });

    it("returns subscriber list without status filter", async () => {
      const subscribers = [
        { email: "a@b.com", status: "verified" },
        { email: "c@d.com", status: "pending" },
      ];
      getSubscriberList.mockResolvedValue(subscribers);

      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-site",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.channelId).toBe("test-site");
      expect(body.count).toBe(2);
      expect(body.subscribers).toEqual(subscribers);
      expect(getSubscriberList).toHaveBeenCalledWith(
        env.DB,
        "test-site",
        null,
      );
    });

    it("passes status filter when provided", async () => {
      getSubscriberList.mockResolvedValue([]);

      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-site",
        status: "verified",
      });

      await handleAdmin(request, env, url);

      expect(getSubscriberList).toHaveBeenCalledWith(
        env.DB,
        "test-site",
        "verified",
      );
    });

    it("returns correct count for filtered results", async () => {
      getSubscriberList.mockResolvedValue([
        { email: "a@b.com", status: "verified" },
      ]);

      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-site",
        status: "verified",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(body.count).toBe(1);
    });

    it("returns empty list and count 0 when no subscribers", async () => {
      getSubscriberList.mockResolvedValue([]);

      const { request, url } = makeRequest("/api/admin/subscribers", {
        channelId: "test-site",
      });

      const response = await handleAdmin(request, env, url);
      const body = await response.json();

      expect(body.count).toBe(0);
      expect(body.subscribers).toEqual([]);
    });
  });
});
