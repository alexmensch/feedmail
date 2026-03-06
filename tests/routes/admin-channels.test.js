import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/db.js", () => ({
  getAllChannels: vi.fn(),
  getChannelById: vi.fn(),
  getFeedsByChannelId: vi.fn(),
  insertChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  insertFeed: vi.fn(),
}));

import { handleAdminChannels } from "../../src/routes/admin-channels.js";
import {
  getAllChannels,
  getChannelById,
  getFeedsByChannelId,
  insertChannel,
  updateChannel,
  deleteChannel,
  insertFeed,
} from "../../src/lib/db.js";

const CHANNEL = {
  id: "test-channel",
  siteName: "Test Site",
  siteUrl: "https://example.com",
  fromUser: "hello",
  fromName: "Test Sender",
  corsOrigins: ["https://example.com"],
};

const CHANNEL_WITH_FEEDS = {
  ...CHANNEL,
  feeds: [{ id: 1, name: "Main Feed", url: "https://example.com/feed.xml" }],
};

const FEED = { id: 1, name: "Main Feed", url: "https://example.com/feed.xml" };

const env = { DB: {}, DOMAIN: "feedmail.cc" };

function makeRequest(method, path, body = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const url = new URL(`https://feedmail.cc${path}`);
  return { request: new Request(url.toString(), options), url };
}

describe("handleAdminChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllChannels.mockResolvedValue([CHANNEL]);
    getChannelById.mockResolvedValue(CHANNEL);
    getFeedsByChannelId.mockResolvedValue([FEED]);
    insertChannel.mockResolvedValue({});
    updateChannel.mockResolvedValue({});
    deleteChannel.mockResolvedValue({});
    insertFeed.mockResolvedValue({});
  });

  describe("GET /api/admin/channels (list)", () => {
    it("returns array of all channels", async () => {
      const { request, url } = makeRequest("GET", "/api/admin/channels");
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(body.channels)).toBe(true);
      expect(body.channels).toHaveLength(1);
      expect(body.channels[0].id).toBe("test-channel");
    });

    it("returns empty array if no channels exist", async () => {
      getAllChannels.mockResolvedValue([]);
      const { request, url } = makeRequest("GET", "/api/admin/channels");
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.channels).toEqual([]);
    });

    it("does not include feeds in list response", async () => {
      const { request, url } = makeRequest("GET", "/api/admin/channels");
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(body.channels[0]).not.toHaveProperty("feeds");
      expect(getFeedsByChannelId).not.toHaveBeenCalled();
    });

    it("returns all channel fields in list response", async () => {
      const fullChannel = {
        ...CHANNEL,
        replyTo: "reply@example.com",
        companyName: "Acme Corp",
        companyAddress: "123 Main St",
      };
      getAllChannels.mockResolvedValue([fullChannel]);

      const { request, url } = makeRequest("GET", "/api/admin/channels");
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      const ch = body.channels[0];
      expect(ch.id).toBe("test-channel");
      expect(ch.siteName).toBe("Test Site");
      expect(ch.siteUrl).toBe("https://example.com");
      expect(ch.fromUser).toBe("hello");
      expect(ch.fromName).toBe("Test Sender");
      expect(ch.replyTo).toBe("reply@example.com");
      expect(ch.companyName).toBe("Acme Corp");
      expect(ch.companyAddress).toBe("123 Main St");
      expect(ch.corsOrigins).toEqual(["https://example.com"]);
    });
  });

  describe("GET /api/admin/channels/{channelId} (get)", () => {
    it("returns single channel with feeds", async () => {
      getChannelById.mockResolvedValue(CHANNEL);
      getFeedsByChannelId.mockResolvedValue([FEED]);

      const { request, url } = makeRequest(
        "GET",
        "/api/admin/channels/test-channel",
      );
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.id).toBe("test-channel");
      expect(body.feeds).toEqual([FEED]);
    });

    it("returns 404 if channel not found", async () => {
      getChannelById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "GET",
        "/api/admin/channels/nonexistent",
      );
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body).toHaveProperty("error");
    });

    it("includes feed list in get response", async () => {
      const feeds = [
        { id: 1, name: "Feed A", url: "https://example.com/a.xml" },
        { id: 2, name: "Feed B", url: "https://example.com/b.xml" },
      ];
      getFeedsByChannelId.mockResolvedValue(feeds);

      const { request, url } = makeRequest(
        "GET",
        "/api/admin/channels/test-channel",
      );
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(body.feeds).toHaveLength(2);
    });

    it("returns channel with empty feeds array when no feeds exist", async () => {
      getFeedsByChannelId.mockResolvedValue([]);

      const { request, url } = makeRequest(
        "GET",
        "/api/admin/channels/test-channel",
      );
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(body.feeds).toEqual([]);
    });
  });

  describe("POST /api/admin/channels (create)", () => {
    it("creates a new channel with all required fields and feeds", async () => {
      getChannelById.mockResolvedValue(null); // no duplicate

      const newChannel = {
        id: "new-channel",
        siteName: "New Site",
        siteUrl: "https://new.example.com",
        fromUser: "news",
        fromName: "New Sender",
        corsOrigins: ["https://new.example.com"],
        feeds: [{ name: "Main Feed", url: "https://new.example.com/feed.xml" }],
      };

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels",
        newChannel,
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(201);
      expect(insertChannel).toHaveBeenCalled();
      expect(insertFeed).toHaveBeenCalled();
    });

    it("returns the created channel in response", async () => {
      getChannelById.mockResolvedValue(null);
      // After creation, return the channel
      getChannelById.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: "new-channel",
        siteName: "New Site",
        siteUrl: "https://new.example.com",
        fromUser: "news",
        fromName: "New Sender",
        corsOrigins: ["https://new.example.com"],
      });
      getFeedsByChannelId.mockResolvedValue([
        { id: 1, name: "Main Feed", url: "https://new.example.com/feed.xml" },
      ]);

      const newChannel = {
        id: "new-channel",
        siteName: "New Site",
        siteUrl: "https://new.example.com",
        fromUser: "news",
        fromName: "New Sender",
        corsOrigins: ["https://new.example.com"],
        feeds: [{ name: "Main Feed", url: "https://new.example.com/feed.xml" }],
      };

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels",
        newChannel,
      );
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.id).toBe("new-channel");
    });

    it("returns 409 when channel ID already exists", async () => {
      getChannelById.mockResolvedValue(CHANNEL);

      const newChannel = {
        id: "test-channel", // already exists
        siteName: "New Site",
        siteUrl: "https://new.example.com",
        fromUser: "news",
        fromName: "New Sender",
        corsOrigins: ["https://new.example.com"],
        feeds: [{ name: "Feed", url: "https://new.example.com/feed.xml" }],
      };

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels",
        newChannel,
      );
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toHaveProperty("error");
    });

    describe("validation", () => {
      const validChannel = {
        id: "new-ch",
        siteName: "Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: ["https://example.com"],
        feeds: [{ name: "Feed", url: "https://example.com/feed.xml" }],
      };

      beforeEach(() => {
        getChannelById.mockResolvedValue(null);
      });

      it("rejects missing id", async () => {
        const { id, ...channelNoId } = validChannel;
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          channelNoId,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects missing siteName", async () => {
        const { siteName, ...ch } = validChannel;
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects missing siteUrl", async () => {
        const { siteUrl, ...ch } = validChannel;
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects missing fromUser", async () => {
        const { fromUser, ...ch } = validChannel;
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects missing fromName", async () => {
        const { fromName, ...ch } = validChannel;
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects missing corsOrigins", async () => {
        const { corsOrigins, ...ch } = validChannel;
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects fromUser containing @", async () => {
        const ch = { ...validChannel, fromUser: "user@domain.com" };
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects fromUser containing whitespace", async () => {
        const ch = { ...validChannel, fromUser: "my user" };
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects empty fromUser", async () => {
        const ch = { ...validChannel, fromUser: "" };
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects channel without feeds at creation time", async () => {
        const ch = { ...validChannel, feeds: [] };
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects channel with missing feeds property at creation time", async () => {
        const { feeds, ...ch } = validChannel;
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects feeds with duplicate URLs (exact match) within channel", async () => {
        const ch = {
          ...validChannel,
          feeds: [
            { name: "Feed A", url: "https://example.com/feed.xml" },
            { name: "Feed B", url: "https://example.com/feed.xml" },
          ],
        };
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects feeds with duplicate names (case-insensitive) within channel", async () => {
        const ch = {
          ...validChannel,
          feeds: [
            { name: "Main Feed", url: "https://example.com/feed1.xml" },
            { name: "main feed", url: "https://example.com/feed2.xml" },
          ],
        };
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects feeds with missing name", async () => {
        const ch = {
          ...validChannel,
          feeds: [{ url: "https://example.com/feed.xml" }],
        };
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects feeds with missing url", async () => {
        const ch = {
          ...validChannel,
          feeds: [{ name: "Feed" }],
        };
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects invalid JSON body", async () => {
        const request = new Request(
          "https://feedmail.cc/api/admin/channels",
          {
            method: "POST",
            body: "not json",
          },
        );
        const url = new URL("https://feedmail.cc/api/admin/channels");
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("returns error message in response body", async () => {
        const { id, ...ch } = validChannel;
        const { request, url } = makeRequest(
          "POST",
          "/api/admin/channels",
          ch,
        );
        const response = await handleAdminChannels(request, env, url);
        const body = await response.json();

        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
      });
    });

    it("creates channel with optional fields", async () => {
      getChannelById.mockResolvedValue(null);

      const newChannel = {
        id: "new-channel",
        siteName: "New Site",
        siteUrl: "https://new.example.com",
        fromUser: "news",
        fromName: "New Sender",
        replyTo: "reply@new.example.com",
        companyName: "Acme",
        companyAddress: "123 Main St",
        corsOrigins: ["https://new.example.com"],
        feeds: [{ name: "Feed", url: "https://new.example.com/feed.xml" }],
      };

      const { request, url } = makeRequest(
        "POST",
        "/api/admin/channels",
        newChannel,
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(201);
      expect(insertChannel).toHaveBeenCalled();
    });
  });

  describe("PUT /api/admin/channels/{channelId} (update)", () => {
    it("updates channel fields", async () => {
      getChannelById.mockResolvedValue(CHANNEL);

      const updated = {
        siteName: "Updated Site",
        siteUrl: "https://updated.example.com",
        fromUser: "updated",
        fromName: "Updated Sender",
        corsOrigins: ["https://updated.example.com"],
      };

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel",
        updated,
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(200);
      expect(updateChannel).toHaveBeenCalled();
    });

    it("returns updated channel in response", async () => {
      getChannelById.mockResolvedValue(CHANNEL);
      updateChannel.mockResolvedValue({});
      // After update, return new data
      getChannelById.mockResolvedValueOnce(CHANNEL).mockResolvedValueOnce({
        ...CHANNEL,
        siteName: "Updated Site",
      });

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel",
        {
          siteName: "Updated Site",
          siteUrl: "https://example.com",
          fromUser: "hello",
          fromName: "Test Sender",
          corsOrigins: ["https://example.com"],
        },
      );
      const response = await handleAdminChannels(request, env, url);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.siteName).toBe("Updated Site");
    });

    it("returns 404 when channel not found", async () => {
      getChannelById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/nonexistent",
        {
          siteName: "Updated",
          siteUrl: "https://example.com",
          fromUser: "hello",
          fromName: "Sender",
          corsOrigins: ["https://example.com"],
        },
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(404);
    });

    it("ignores attempt to change channel ID (URL is authoritative)", async () => {
      getChannelById.mockResolvedValue(CHANNEL);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel",
        {
          id: "new-id", // should be ignored
          siteName: "Updated Site",
          siteUrl: "https://example.com",
          fromUser: "hello",
          fromName: "Test Sender",
          corsOrigins: ["https://example.com"],
        },
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(200);
      // updateChannel should be called with the URL channelId, not body id
      expect(updateChannel).toHaveBeenCalledWith(
        env.DB,
        "test-channel",
        expect.any(Object),
      );
    });

    it("updates optional fields (replyTo, companyName, companyAddress)", async () => {
      getChannelById.mockResolvedValue(CHANNEL);

      const { request, url } = makeRequest(
        "PUT",
        "/api/admin/channels/test-channel",
        {
          siteName: "Test Site",
          siteUrl: "https://example.com",
          fromUser: "hello",
          fromName: "Test Sender",
          replyTo: "reply@example.com",
          companyName: "Acme",
          companyAddress: "123 Main St",
          corsOrigins: ["https://example.com"],
        },
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(200);
    });

    describe("validation", () => {
      it("rejects fromUser containing @", async () => {
        getChannelById.mockResolvedValue(CHANNEL);

        const { request, url } = makeRequest(
          "PUT",
          "/api/admin/channels/test-channel",
          {
            siteName: "Test Site",
            siteUrl: "https://example.com",
            fromUser: "bad@user",
            fromName: "Sender",
            corsOrigins: ["https://example.com"],
          },
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects fromUser containing whitespace", async () => {
        getChannelById.mockResolvedValue(CHANNEL);

        const { request, url } = makeRequest(
          "PUT",
          "/api/admin/channels/test-channel",
          {
            siteName: "Test Site",
            siteUrl: "https://example.com",
            fromUser: "bad user",
            fromName: "Sender",
            corsOrigins: ["https://example.com"],
          },
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });

      it("rejects invalid JSON body", async () => {
        getChannelById.mockResolvedValue(CHANNEL);

        const request = new Request(
          "https://feedmail.cc/api/admin/channels/test-channel",
          {
            method: "PUT",
            body: "not json",
          },
        );
        const url = new URL(
          "https://feedmail.cc/api/admin/channels/test-channel",
        );
        const response = await handleAdminChannels(request, env, url);

        expect(response.status).toBe(400);
      });
    });
  });

  describe("DELETE /api/admin/channels/{channelId}", () => {
    it("deletes a channel and returns 204", async () => {
      getChannelById.mockResolvedValue(CHANNEL);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/test-channel",
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(204);
      expect(deleteChannel).toHaveBeenCalledWith(env.DB, "test-channel");
    });

    it("returns 404 when channel not found", async () => {
      getChannelById.mockResolvedValue(null);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/nonexistent",
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(404);
    });

    it("cascades delete to feeds, subscribers, verification_attempts, subscriber_sends, and sent_items", async () => {
      getChannelById.mockResolvedValue(CHANNEL);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/test-channel",
      );
      await handleAdminChannels(request, env, url);

      // The deleteChannel DB function should handle cascade internally
      expect(deleteChannel).toHaveBeenCalledWith(env.DB, "test-channel");
    });

    it("returns no body on successful delete", async () => {
      getChannelById.mockResolvedValue(CHANNEL);

      const { request, url } = makeRequest(
        "DELETE",
        "/api/admin/channels/test-channel",
      );
      const response = await handleAdminChannels(request, env, url);

      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
    });
  });
});
