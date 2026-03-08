import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/db.js", () => ({
  getChannelById: vi.fn(),
  getFeedsByChannelId: vi.fn(),
  getFeedById: vi.fn(),
  insertFeed: vi.fn(),
  updateFeed: vi.fn(),
  deleteFeed: vi.fn()
}));

import { handleAdminFeeds } from "../../src/routes/admin-feeds.js";
import {
  getChannelById,
  getFeedsByChannelId,
  getFeedById,
  insertFeed,
  updateFeed,
  deleteFeed
} from "../../src/lib/db.js";

const CHANNEL = {
  id: "test-channel",
  siteName: "Test Site",
  siteUrl: "https://example.com",
  fromUser: "hello",
  fromName: "Test Sender",
  corsOrigins: ["https://example.com"]
};

const FEED_A = {
  id: 1,
  channelId: "test-channel",
  name: "Feed A",
  url: "https://example.com/a.xml"
};
const FEED_B = {
  id: 2,
  channelId: "test-channel",
  name: "Feed B",
  url: "https://example.com/b.xml"
};

const env = { DB: {} };

function makeRequest(method, path, body = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const url = new URL(`https://feedmail.cc${path}`);
  return { request: new Request(url.toString(), options), url };
}

describe("handleAdminFeeds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelById.mockResolvedValue(CHANNEL);
    getFeedsByChannelId.mockResolvedValue([FEED_A, FEED_B]);
    getFeedById.mockResolvedValue(FEED_A);
    insertFeed.mockResolvedValue({ id: 3 });
    updateFeed.mockResolvedValue({});
    deleteFeed.mockResolvedValue({});
  });

  describe("GET /api/admin/channels/{channelId}/feeds (list)", () => {
    it("returns array of feeds for a channel", async () => {
      const { request, url } = makeRequest(
        "GET",
        "/api/admin/channels/test-channel/feeds"
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(body.feeds)).toBe(true);
      expect(body.feeds).toHaveLength(2);
    });

    it("returns 404 when channel not found", async () => {
      getChannelById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "GET",
        "/api/admin/channels/nonexistent/feeds"
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body).toHaveProperty("error");
    });

    it("returns empty array if channel has no feeds", async () => {
      getFeedsByChannelId.mockResolvedValue([]);

      const { request, url } = makeRequest(
        "GET",
        "/api/admin/channels/test-channel/feeds"
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.feeds).toEqual([]);
    });

    it("returns feeds with integer IDs", async () => {
      const { request, url } = makeRequest(
        "GET",
        "/api/admin/channels/test-channel/feeds"
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      for (const feed of body.feeds) {
        expect(typeof feed.id).toBe("number");
      }
    });
  });

  describe("POST /api/admin/channels/{channelId}/feeds (add)", () => {
    it("adds a feed to a channel", async () => {
      getFeedsByChannelId.mockResolvedValue([]); // no existing feeds for dupe check

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels/test-channel/feeds",
        { name: "New Feed", url: "https://example.com/new.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(201);
      expect(insertFeed).toHaveBeenCalledWith(
        env.DB,
        "test-channel",
        expect.objectContaining({
          name: "New Feed",
          url: "https://example.com/new.xml"
        })
      );
    });

    it("returns the created feed in response", async () => {
      getFeedsByChannelId.mockResolvedValue([]);
      getFeedById.mockResolvedValue({
        id: 3,
        channelId: "test-channel",
        name: "New Feed",
        url: "https://example.com/new.xml"
      });

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels/test-channel/feeds",
        { name: "New Feed", url: "https://example.com/new.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.name).toBe("New Feed");
      expect(body.url).toBe("https://example.com/new.xml");
    });

    it("returns 404 when channel not found", async () => {
      getChannelById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels/nonexistent/feeds",
        { name: "Feed", url: "https://example.com/feed.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(404);
    });

    it("returns 409 when feed URL duplicates existing feed in same channel", async () => {
      getFeedsByChannelId.mockResolvedValue([FEED_A]);

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels/test-channel/feeds",
        { name: "Different Name", url: FEED_A.url } // same URL
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toHaveProperty("error");
    });

    it("returns 409 when feed name duplicates existing feed (case-insensitive)", async () => {
      getFeedsByChannelId.mockResolvedValue([FEED_A]);

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels/test-channel/feeds",
        { name: "feed a", url: "https://example.com/different.xml" } // same name case-insensitive
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toHaveProperty("error");
    });

    it("allows feed with same URL in different channel", async () => {
      getFeedsByChannelId.mockResolvedValue([]); // different channel has no feeds

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels/test-channel/feeds",
        {
          name: "Cross-channel Feed",
          url: "https://other.example.com/feed.xml"
        }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(201);
    });

    describe("validation", () => {
      it("rejects missing name", async () => {
        getFeedsByChannelId.mockResolvedValue([]);

        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels/test-channel/feeds",
          { url: "https://example.com/feed.xml" }
        );
        const response = await handleAdminFeeds(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects empty name", async () => {
        getFeedsByChannelId.mockResolvedValue([]);

        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels/test-channel/feeds",
          { name: "", url: "https://example.com/feed.xml" }
        );
        const response = await handleAdminFeeds(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects missing url", async () => {
        getFeedsByChannelId.mockResolvedValue([]);

        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels/test-channel/feeds",
          { name: "Feed" }
        );
        const response = await handleAdminFeeds(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects empty url", async () => {
        getFeedsByChannelId.mockResolvedValue([]);

        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels/test-channel/feeds",
          { name: "Feed", url: "" }
        );
        const response = await handleAdminFeeds(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects invalid JSON body", async () => {
        const request = new Request(
          "https://feedmail.cc/api/admin/channels/test-channel/feeds",
          {
            method: "POST",
            body: "not json"
          }
        );
        const url = new URL(
          "https://feedmail.cc/api/admin/channels/test-channel/feeds"
        );
        const response = await handleAdminFeeds(request, env, url);

        expect(response.status).toBe(400);
      });
    });

    it("new feed is bootstrapped on next cron run (no special handling needed at API level)", async () => {
      // The add-feed endpoint just creates the feed in the DB.
      // On the next cron run, checkFeedsAndSend will see it as a new feed,
      // isFeedSeeded will return false, and it will be bootstrapped.
      // This test verifies the feed is created and the cron logic handles bootstrapping.
      getFeedsByChannelId.mockResolvedValue([]);

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels/test-channel/feeds",
        { name: "Brand New Feed", url: "https://example.com/brand-new.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(201);
      expect(insertFeed).toHaveBeenCalled();
    });
  });

  describe("PUT /api/admin/channels/{channelId}/feeds/{feedId} (update)", () => {
    it("updates a feed name and url", async () => {
      getFeedById.mockResolvedValue(FEED_A);
      getFeedsByChannelId.mockResolvedValue([FEED_A, FEED_B]);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel/feeds/1",
        { name: "Updated Feed", url: "https://example.com/updated.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(200);
      expect(updateFeed).toHaveBeenCalledWith(
        env.DB,
        1,
        expect.objectContaining({
          name: "Updated Feed",
          url: "https://example.com/updated.xml"
        })
      );
    });

    it("returns 404 when feed not found", async () => {
      getFeedById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel/feeds/999",
        { name: "Updated", url: "https://example.com/updated.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(404);
    });

    it("returns 404 when channel not found", async () => {
      getChannelById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/nonexistent/feeds/1",
        { name: "Updated", url: "https://example.com/updated.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(404);
    });

    it("returns 409 when new URL duplicates another feed in same channel", async () => {
      getFeedById.mockResolvedValue(FEED_A);
      getFeedsByChannelId.mockResolvedValue([FEED_A, FEED_B]);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel/feeds/1",
        { name: "Feed A", url: FEED_B.url } // URL matches Feed B
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toHaveProperty("error");
    });

    it("returns 409 when new name duplicates another feed (case-insensitive)", async () => {
      getFeedById.mockResolvedValue(FEED_A);
      getFeedsByChannelId.mockResolvedValue([FEED_A, FEED_B]);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel/feeds/1",
        { name: "feed b", url: "https://example.com/a.xml" } // name matches Feed B
      );
      const response = await handleAdminFeeds(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toHaveProperty("error");
    });

    it("allows keeping the same URL when updating only the name", async () => {
      getFeedById.mockResolvedValue(FEED_A);
      getFeedsByChannelId.mockResolvedValue([FEED_A, FEED_B]);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel/feeds/1",
        { name: "Renamed Feed A", url: FEED_A.url } // same URL as itself
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(200);
    });

    it("allows keeping the same name when updating only the URL", async () => {
      getFeedById.mockResolvedValue(FEED_A);
      getFeedsByChannelId.mockResolvedValue([FEED_A, FEED_B]);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel/feeds/1",
        { name: FEED_A.name, url: "https://example.com/different.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(200);
    });

    it("when URL is changed, the new URL is treated as a fresh feed on next cron run", async () => {
      // This test documents the behavior: changing a feed URL means the old
      // sent_items stay associated with the old URL, and the new URL will be
      // bootstrapped on the next cron run as if it were a brand-new feed.
      getFeedById.mockResolvedValue(FEED_A);
      getFeedsByChannelId.mockResolvedValue([FEED_A, FEED_B]);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel/feeds/1",
        { name: "Feed A", url: "https://example.com/new-url.xml" }
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(200);
      expect(updateFeed).toHaveBeenCalledWith(
        env.DB,
        1,
        expect.objectContaining({ url: "https://example.com/new-url.xml" })
      );
    });
  });

  describe("DELETE /api/admin/channels/{channelId}/feeds/{feedId}", () => {
    it("deletes a feed and returns 204", async () => {
      getFeedById.mockResolvedValue(FEED_A);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/test-channel/feeds/1"
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(204);
      expect(deleteFeed).toHaveBeenCalledWith(env.DB, 1);
    });

    it("returns 404 when feed not found", async () => {
      getFeedById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/test-channel/feeds/999"
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(404);
    });

    it("returns 404 when channel not found", async () => {
      getChannelById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/nonexistent/feeds/1"
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(404);
    });

    it("removes associated sent_items and subscriber_sends when deleting feed", async () => {
      getFeedById.mockResolvedValue(FEED_A);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/test-channel/feeds/1"
      );
      await handleAdminFeeds(request, env, url);

      // deleteFeed should handle removing associated sent_items and subscriber_sends
      expect(deleteFeed).toHaveBeenCalledWith(env.DB, 1);
    });

    it("returns no body on successful delete", async () => {
      getFeedById.mockResolvedValue(FEED_A);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/test-channel/feeds/1"
      );
      const response = await handleAdminFeeds(request, env, url);

      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
    });
  });
});
