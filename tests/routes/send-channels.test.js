import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
  getChannels: vi.fn(),
  getChannelById: vi.fn(),
}));
vi.mock("../../src/lib/feed-parser.js", () => ({
  fetchAndParseFeed: vi.fn(),
}));
vi.mock("../../src/lib/email.js", () => ({
  sendEmail: vi.fn(),
}));
vi.mock("../../src/lib/html-to-text.js", () => ({
  htmlToText: vi.fn().mockReturnValue("plain text"),
  constrainImages: vi.fn().mockImplementation((html) => html || ""),
}));
vi.mock("../../src/lib/templates.js", () => ({
  render: vi.fn().mockImplementation((name) => {
    if (name === "newsletter") return "html with %%UNSUBSCRIBE_URL%%";
    if (name === "newsletterText")
      return "text with %%UNSUBSCRIBE_URL%%";
    return "rendered";
  }),
}));
vi.mock("../../src/lib/db.js", () => ({
  isFeedSeeded: vi.fn(),
  isItemSent: vi.fn(),
  insertSentItem: vi.fn(),
  getVerifiedSubscribers: vi.fn(),
  isItemSentToSubscriber: vi.fn(),
  insertSubscriberSend: vi.fn(),
  deleteSubscriberSends: vi.fn(),
}));

import { handleSend, checkFeedsAndSend } from "../../src/routes/send.js";
import { getChannels, getChannelById } from "../../src/lib/config.js";
import { fetchAndParseFeed } from "../../src/lib/feed-parser.js";
import { sendEmail } from "../../src/lib/email.js";
import { htmlToText, constrainImages } from "../../src/lib/html-to-text.js";
import { render } from "../../src/lib/templates.js";
import {
  isFeedSeeded,
  isItemSent,
  insertSentItem,
  getVerifiedSubscribers,
  isItemSentToSubscriber,
  insertSubscriberSend,
  deleteSubscriberSends,
} from "../../src/lib/db.js";

const CHANNEL = {
  id: "test-channel",
  siteUrl: "https://test.example.com",
  siteName: "Test Site",
  fromUser: "hello",
  fromName: "Test",
  replyTo: "reply@test.example.com",
  feeds: [{ name: "Main Feed", url: "https://test.example.com/feed.xml" }],
};

const ITEM = {
  id: "item-1",
  title: "Test Post",
  link: "https://test.example.com/post-1",
  date: "2025-01-15T10:00:00Z",
  content: "<p>Full content</p>",
  summary: "A summary",
};

const env = {
  DB: {},
  RESEND_API_KEY: "re_test",
  DOMAIN: "test.example.com",
  CHANNELS: JSON.stringify([CHANNEL]),
};

describe("handleSend — channel restructuring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannels.mockReturnValue([CHANNEL]);
    getChannelById.mockReturnValue(CHANNEL);
    isFeedSeeded.mockResolvedValue(true);
    isItemSent.mockResolvedValue(true);
    fetchAndParseFeed.mockResolvedValue([ITEM]);
    getVerifiedSubscribers.mockResolvedValue([]);
    sendEmail.mockResolvedValue({ success: true });
    isItemSentToSubscriber.mockResolvedValue(false);
  });

  it("accepts channelId in request body (not siteId)", async () => {
    const request = new Request("https://test.example.com/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: "test-channel" }),
    });

    const response = await handleSend(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("sent");
    expect(body).toHaveProperty("items");
  });

  it("uses getChannels instead of getSites", async () => {
    const request = new Request("https://test.example.com/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    await handleSend(request, env);

    expect(getChannels).toHaveBeenCalled();
  });
});

describe("checkFeedsAndSend — channel restructuring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannels.mockReturnValue([CHANNEL]);
    isFeedSeeded.mockResolvedValue(true);
    isItemSent.mockResolvedValue(true);
    fetchAndParseFeed.mockResolvedValue([ITEM]);
    getVerifiedSubscribers.mockResolvedValue([]);
    sendEmail.mockResolvedValue({ success: true });
    isItemSentToSubscriber.mockResolvedValue(false);
  });

  describe("uses getChannels instead of getSites", () => {
    it("calls getChannels to get channel list", async () => {
      await checkFeedsAndSend(env, null);

      expect(getChannels).toHaveBeenCalledWith(env);
    });
  });

  describe("feeds are structured objects with name and url", () => {
    it("uses feed.url for fetching", async () => {
      await checkFeedsAndSend(env);

      expect(fetchAndParseFeed).toHaveBeenCalledWith(
        "https://test.example.com/feed.xml",
        expect.any(String),
      );
    });

    it("iterates channel.feeds as objects, not strings", async () => {
      const channel = {
        ...CHANNEL,
        feeds: [
          { name: "Feed 1", url: "https://test.example.com/feed1.xml" },
          { name: "Feed 2", url: "https://test.example.com/feed2.xml" },
        ],
      };
      getChannels.mockReturnValue([channel]);

      await checkFeedsAndSend(env, null);

      expect(fetchAndParseFeed).toHaveBeenCalledTimes(2);
      expect(fetchAndParseFeed).toHaveBeenCalledWith(
        "https://test.example.com/feed1.xml",
        expect.any(String),
      );
      expect(fetchAndParseFeed).toHaveBeenCalledWith(
        "https://test.example.com/feed2.xml",
        expect.any(String),
      );
    });

    it("handles empty feeds array without errors", async () => {
      const channelNoFeeds = { ...CHANNEL, feeds: [] };
      getChannels.mockReturnValue([channelNoFeeds]);

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(fetchAndParseFeed).not.toHaveBeenCalled();
    });
  });

  describe("channel filtering uses channelId", () => {
    it("filters by channelId when provided", async () => {
      const channel2 = {
        ...CHANNEL,
        id: "channel-2",
        feeds: [{ name: "Other Feed", url: "https://other.example.com/feed" }],
      };
      getChannels.mockReturnValue([CHANNEL, channel2]);

      await checkFeedsAndSend(env, "test-channel");

      expect(fetchAndParseFeed).toHaveBeenCalledTimes(1);
      expect(fetchAndParseFeed).toHaveBeenCalledWith(
        "https://test.example.com/feed.xml",
        expect.any(String),
      );
    });

    it("skips non-matching channels", async () => {
      getChannels.mockReturnValue([CHANNEL]);

      await checkFeedsAndSend(env, "nonexistent-channel");

      expect(fetchAndParseFeed).not.toHaveBeenCalled();
    });
  });

  describe("from-email constructed as fromUser@DOMAIN", () => {
    const subscriber1 = {
      id: 1,
      email: "user1@test.com",
      unsubscribe_token: "unsub-1",
    };

    it("sends email with from address as fromUser@DOMAIN", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].from).toBe("hello@test.example.com");
    });

    it("from-email uses channel.fromUser combined with env.DOMAIN", async () => {
      const channelOther = {
        ...CHANNEL,
        fromUser: "newsletter",
      };
      getChannels.mockReturnValue([channelOther]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].from).toBe("newsletter@test.example.com");
    });
  });

  describe("URLs use https://{DOMAIN}", () => {
    const subscriber1 = {
      id: 1,
      email: "user1@test.com",
      unsubscribe_token: "unsub-1",
    };

    it("unsubscribe URL uses https://{DOMAIN}/api/unsubscribe", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].html).toContain(
        "https://test.example.com/api/unsubscribe?token=unsub-1",
      );
      expect(emailCall[1].text).toContain(
        "https://test.example.com/api/unsubscribe?token=unsub-1",
      );
    });

    it("List-Unsubscribe header uses https://{DOMAIN}", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const headers = sendEmail.mock.calls[0][1].headers;
      expect(headers["List-Unsubscribe"]).toBe(
        "<https://test.example.com/api/unsubscribe?token=unsub-1>",
      );
    });

    it("does not reference feedmail.cc in URLs", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].html).not.toContain("feedmail.cc");
      expect(emailCall[1].text).not.toContain("feedmail.cc");
      expect(emailCall[1].headers["List-Unsubscribe"]).not.toContain("feedmail.cc");
    });
  });

  describe("template data uses channel field names", () => {
    const subscriber1 = {
      id: 1,
      email: "user1@test.com",
      unsubscribe_token: "unsub-1",
    };

    it("passes channel.siteName to newsletter template", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          siteName: "Test Site",
          siteUrl: "https://test.example.com",
        }),
      );
    });

    it("passes channel.siteName to newsletter text template", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletterText",
        expect.objectContaining({
          siteName: "Test Site",
        }),
      );
    });
  });

  describe("no BASE_URL references", () => {
    const subscriber1 = {
      id: 1,
      email: "user1@test.com",
      unsubscribe_token: "unsub-1",
    };

    it("uses env.DOMAIN for URL construction, not env.BASE_URL", async () => {
      const envWithBaseUrl = {
        ...env,
        BASE_URL: "https://old.feedmail.cc",
      };
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(envWithBaseUrl);

      const emailCall = sendEmail.mock.calls[0];
      // URLs should use DOMAIN, not BASE_URL
      expect(emailCall[1].html).toContain("test.example.com");
      expect(emailCall[1].html).not.toContain("feedmail.cc");
    });
  });

  describe("summary includes channelId (not siteId)", () => {
    it("summary items include channelId field", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" },
      ]);

      const result = await checkFeedsAndSend(env);

      expect(result.items[0]).toHaveProperty("channelId", "test-channel");
      // Should NOT have siteId
      expect(result.items[0]).not.toHaveProperty("siteId");
    });
  });
});
