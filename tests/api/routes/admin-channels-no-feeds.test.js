import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/shared/lib/db.js", () => ({
  getAllChannels: vi.fn(),
  getChannelById: vi.fn(),
  getFeedsByChannelId: vi.fn(),
  insertChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  insertFeed: vi.fn()
}));

import { handleAdminChannels } from "../../../src/api/routes/admin-channels.js";
import {
  getChannelById,
  getFeedsByChannelId,
  insertChannel,
  insertFeed
} from "../../../src/shared/lib/db.js";

const env = { DB: {}, DOMAIN: "feedmail.cc" };

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

describe("channel creation without feeds (requireFeeds: false)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelById.mockResolvedValue(null); // No duplicate
    insertChannel.mockResolvedValue({});
    insertFeed.mockResolvedValue({});
    getFeedsByChannelId.mockResolvedValue([]);
  });

  it("creates a channel without feeds field", async () => {
    const channelData = {
      id: "new-channel",
      siteName: "Test Site",
      siteUrl: "https://example.com",
      fromUser: "hello",
      fromName: "Test Sender",
      corsOrigins: ["https://example.com"]
    };

    // After insert, return the created channel
    getChannelById
      .mockResolvedValueOnce(null) // duplicate check
      .mockResolvedValueOnce(channelData); // return created

    const { request, url } = makeRequest(
      "POST",
      "/api/admin/channels",
      channelData
    );

    const response = await handleAdminChannels(request, env, url);

    expect(response.status).toBe(201);
    expect(insertChannel).toHaveBeenCalled();
    expect(insertFeed).not.toHaveBeenCalled();
  });

  it("creates a channel with empty feeds array", async () => {
    const channelData = {
      id: "new-channel",
      siteName: "Test Site",
      siteUrl: "https://example.com",
      fromUser: "hello",
      fromName: "Test Sender",
      corsOrigins: ["https://example.com"],
      feeds: []
    };

    getChannelById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "new-channel",
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Test Sender"
      });

    const { request, url } = makeRequest(
      "POST",
      "/api/admin/channels",
      channelData
    );

    const response = await handleAdminChannels(request, env, url);

    expect(response.status).toBe(201);
    expect(insertChannel).toHaveBeenCalled();
    expect(insertFeed).not.toHaveBeenCalled();
  });

  it("still allows creating a channel with feeds", async () => {
    const channelData = {
      id: "new-channel",
      siteName: "Test Site",
      siteUrl: "https://example.com",
      fromUser: "hello",
      fromName: "Test Sender",
      corsOrigins: ["https://example.com"],
      feeds: [{ name: "Main", url: "https://example.com/feed.xml" }]
    };

    getChannelById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "new-channel",
        siteName: "Test Site"
      });
    getFeedsByChannelId.mockResolvedValue([
      { id: 1, name: "Main", url: "https://example.com/feed.xml" }
    ]);

    const { request, url } = makeRequest(
      "POST",
      "/api/admin/channels",
      channelData
    );

    const response = await handleAdminChannels(request, env, url);

    expect(response.status).toBe(201);
    expect(insertChannel).toHaveBeenCalled();
    expect(insertFeed).toHaveBeenCalledWith(
      env.DB,
      "new-channel",
      expect.objectContaining({ name: "Main" })
    );
  });
});
