import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/shared/lib/config.js", () => ({
  getChannels: vi.fn(),
  getChannelById: vi.fn()
}));
vi.mock("../../../src/api/lib/feed-parser.js", () => ({
  fetchAndParseFeed: vi.fn()
}));
vi.mock("../../../src/shared/lib/email.js", () => ({
  sendEmail: vi.fn()
}));
vi.mock("../../../src/api/lib/html-to-text.js", () => ({
  htmlToText: vi.fn().mockReturnValue("plain text"),
  constrainImages: vi.fn().mockImplementation((html) => html || "")
}));
vi.mock("../../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockImplementation((name) => {
    if (name === "newsletter") {
      return "html with %%UNSUBSCRIBE_URL%%";
    }
    if (name === "newsletterText") {
      return "text with %%UNSUBSCRIBE_URL%%";
    }
    return "rendered";
  })
}));
vi.mock("../../../src/shared/lib/db.js", () => ({
  isFeedSeeded: vi.fn(),
  isItemSent: vi.fn(),
  insertSentItem: vi.fn(),
  getVerifiedSubscribers: vi.fn(),
  isItemSentToSubscriber: vi.fn(),
  insertSubscriberSend: vi.fn(),
  deleteSubscriberSends: vi.fn(),
  getResendApiKey: vi.fn().mockResolvedValue("re_test")
}));

import { handleSend, checkFeedsAndSend } from "../../../src/api/routes/send.js";
import { getChannels, getChannelById } from "../../../src/shared/lib/config.js";
import { fetchAndParseFeed } from "../../../src/api/lib/feed-parser.js";
import { sendEmail } from "../../../src/shared/lib/email.js";
import {
  htmlToText,
  constrainImages
} from "../../../src/api/lib/html-to-text.js";
import { render } from "../../../src/shared/lib/templates.js";
import {
  isFeedSeeded,
  isItemSent,
  insertSentItem,
  getVerifiedSubscribers,
  isItemSentToSubscriber,
  insertSubscriberSend,
  deleteSubscriberSends,
  getResendApiKey
} from "../../../src/shared/lib/db.js";

const CHANNEL = {
  id: "test-site",
  siteUrl: "https://example.com",
  siteName: "Test Site",
  fromUser: "hello",
  fromName: "Test",
  replyTo: "reply@example.com",
  feeds: [{ name: "Main Feed", url: "https://example.com/feed.xml" }]
};

const ITEM = {
  id: "item-1",
  title: "Test Post",
  link: "https://example.com/post-1",
  date: "2025-01-15T10:00:00Z",
  content: "<p>Full content</p>",
  summary: "A summary"
};

const env = {
  DB: {},
  RESEND_API_KEY: "re_test",
  DOMAIN: "test.example.com",
  CHANNELS: JSON.stringify([CHANNEL])
};

describe("handleSend", () => {
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

  it("returns JSON response with summary", async () => {
    const request = new Request("https://test.example.com/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const response = await handleSend(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("sent");
    expect(body).toHaveProperty("items");
  });

  it("filters by siteId when provided", async () => {
    const request = new Request("https://test.example.com/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: "test-site" })
    });

    await handleSend(request, env);

    // checkFeedsAndSend should be called with targetChannelId
    expect(getChannels).toHaveBeenCalled();
  });

  it("handles invalid JSON body gracefully", async () => {
    const request = new Request("https://test.example.com/api/send", {
      method: "POST",
      body: "not json"
    });

    const response = await handleSend(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    // Should process all sites (targetChannelId is null)
    expect(body).toHaveProperty("sent");
  });

  it("handles empty body", async () => {
    const request = new Request("https://test.example.com/api/send", {
      method: "POST"
    });

    const response = await handleSend(request, env);

    expect(response.status).toBe(200);
  });
});

describe("checkFeedsAndSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannels.mockReturnValue([CHANNEL]);
    isFeedSeeded.mockResolvedValue(true);
    isItemSent.mockResolvedValue(true);
    fetchAndParseFeed.mockResolvedValue([ITEM]);
    getVerifiedSubscribers.mockResolvedValue([]);
    sendEmail.mockResolvedValue({ success: true });
    isItemSentToSubscriber.mockResolvedValue(false);
    getResendApiKey.mockResolvedValue("re_test");
  });

  describe("channel filtering", () => {
    it("processes all channels when targetChannelId is null", async () => {
      const site2 = {
        ...CHANNEL,
        id: "channel-2",
        feeds: [{ name: "Other Feed", url: "https://other.com/feed" }]
      };
      getChannels.mockReturnValue([CHANNEL, site2]);

      await checkFeedsAndSend(env, null);

      // fetchAndParseFeed should be called for both sites' feeds
      expect(fetchAndParseFeed).toHaveBeenCalledTimes(2);
    });

    it("processes only matching channel when targetChannelId is set", async () => {
      const site2 = {
        ...CHANNEL,
        id: "channel-2",
        feeds: [{ name: "Other Feed", url: "https://other.com/feed" }]
      };
      getChannels.mockReturnValue([CHANNEL, site2]);

      await checkFeedsAndSend(env, "test-site");

      expect(fetchAndParseFeed).toHaveBeenCalledTimes(1);
      expect(fetchAndParseFeed).toHaveBeenCalledWith(
        "https://example.com/feed.xml",
        expect.any(String)
      );
    });

    it("skips non-matching channels", async () => {
      getChannels.mockReturnValue([CHANNEL]);

      await checkFeedsAndSend(env, "nonexistent-site");

      expect(fetchAndParseFeed).not.toHaveBeenCalled();
    });
  });

  describe("feed bootstrapping", () => {
    it("seeds all items when feed is not yet seeded", async () => {
      isFeedSeeded.mockResolvedValue(false);
      fetchAndParseFeed.mockResolvedValue([ITEM, { ...ITEM, id: "item-2" }]);

      const result = await checkFeedsAndSend(env);

      expect(result.seeded).toBe(true);
      expect(insertSentItem).toHaveBeenCalledTimes(2);
      expect(insertSentItem).toHaveBeenCalledWith(env.DB, {
        itemId: "item-1",
        feedUrl: "https://example.com/feed.xml",
        title: "Test Post",
        recipientCount: 0
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("does not send emails during seeding", async () => {
      isFeedSeeded.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "tok" }
      ]);

      await checkFeedsAndSend(env);

      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("finding unseen items", () => {
    it("skips items that are already sent", async () => {
      isItemSent.mockResolvedValue(true);

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(getVerifiedSubscribers).not.toHaveBeenCalled();
    });

    it("processes unseen items", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([]);

      await checkFeedsAndSend(env);

      // No subscribers, so items marked as sent with 0 recipients
      expect(insertSentItem).toHaveBeenCalledWith(env.DB, {
        itemId: "item-1",
        feedUrl: "https://example.com/feed.xml",
        title: "Test Post",
        recipientCount: 0
      });
    });
  });

  describe("no subscribers", () => {
    it("marks items as sent with 0 recipients when no subscribers", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([]);

      await checkFeedsAndSend(env);

      expect(insertSentItem).toHaveBeenCalledWith(
        env.DB,
        expect.objectContaining({
          recipientCount: 0
        })
      );
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("sending to subscribers", () => {
    const subscriber1 = {
      id: 1,
      email: "user1@test.com",
      unsubscribe_token: "unsub-1"
    };
    const subscriber2 = {
      id: 2,
      email: "user2@test.com",
      unsubscribe_token: "unsub-2"
    };

    it("sends to all verified subscribers", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1, subscriber2]);

      const result = await checkFeedsAndSend(env);

      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect(result.sent).toBe(2);
      expect(result.items[0].complete).toBe(true);
      expect(result.items[0].recipients).toBe(2);
    });

    it("replaces %%UNSUBSCRIBE_URL%% with per-subscriber URL", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].html).toContain(
        "https://test.example.com/api/unsubscribe?token=unsub-1"
      );
      expect(emailCall[1].html).not.toContain("%%UNSUBSCRIBE_URL%%");
      expect(emailCall[1].text).toContain(
        "https://test.example.com/api/unsubscribe?token=unsub-1"
      );
    });

    it("includes List-Unsubscribe headers per subscriber", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const headers = sendEmail.mock.calls[0][1].headers;
      expect(headers["List-Unsubscribe"]).toBe(
        "<https://test.example.com/api/unsubscribe?token=unsub-1>"
      );
      expect(headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click"
      );
    });

    it("inserts subscriber_send for each successful send", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1, subscriber2]);

      await checkFeedsAndSend(env);

      expect(insertSubscriberSend).toHaveBeenCalledTimes(2);
      expect(insertSubscriberSend).toHaveBeenCalledWith(
        env.DB,
        1,
        "item-1",
        "https://example.com/feed.xml"
      );
    });

    it("marks item as sent and deletes subscriber_sends when complete", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(insertSentItem).toHaveBeenCalledWith(env.DB, {
        itemId: "item-1",
        feedUrl: "https://example.com/feed.xml",
        title: "Test Post",
        recipientCount: 1
      });
      expect(deleteSubscriberSends).toHaveBeenCalledWith(
        env.DB,
        "item-1",
        "https://example.com/feed.xml"
      );
    });

    it("sends 0 emails when Resend API key is not configured", async () => {
      getResendApiKey.mockResolvedValue(null);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1, subscriber2]);

      const result = await checkFeedsAndSend(env);

      expect(sendEmail).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      expect(result.items[0].complete).toBe(false);
    });
  });

  describe("partial send recovery", () => {
    const subscriber1 = { id: 1, email: "a@b.com", unsubscribe_token: "u1" };
    const subscriber2 = { id: 2, email: "c@d.com", unsubscribe_token: "u2" };

    it("skips subscribers who already received item", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1, subscriber2]);
      isItemSentToSubscriber
        .mockResolvedValueOnce(true) // subscriber1 already sent
        .mockResolvedValueOnce(false); // subscriber2 not sent

      const result = await checkFeedsAndSend(env);

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
    });

    it("stops sending when quota is exhausted", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1, subscriber2]);

      sendEmail.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({
        success: false,
        quotaExhausted: true,
        error: "Rate limited"
      });

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(1);
      expect(result.items[0].complete).toBe(false);
      // Item should NOT be marked in sent_items
      expect(insertSentItem).not.toHaveBeenCalled();
      // subscriber_sends should NOT be cleaned up
      expect(deleteSubscriberSends).not.toHaveBeenCalled();
    });

    it("continues to next subscriber on permanent failure", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1, subscriber2]);

      sendEmail
        .mockResolvedValueOnce({
          success: false,
          quotaExhausted: false,
          error: "Invalid address"
        })
        .mockResolvedValueOnce({ success: true });

      const result = await checkFeedsAndSend(env);

      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect(result.sent).toBe(1);
      expect(result.items[0].complete).toBe(true);
    });

    it("stops processing further items after quota exhaustion", async () => {
      const item2 = { ...ITEM, id: "item-2", title: "Second Post" };
      fetchAndParseFeed.mockResolvedValue([ITEM, item2]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      sendEmail.mockResolvedValue({
        success: false,
        quotaExhausted: true,
        error: "Rate limited"
      });

      const result = await checkFeedsAndSend(env);

      // Should only try the first item, not the second
      expect(result.items).toHaveLength(1);
    });
  });

  describe("content handling", () => {
    it("uses item content when available", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" }
      ]);

      await checkFeedsAndSend(env);

      expect(constrainImages).toHaveBeenCalledWith("<p>Full content</p>");
      expect(htmlToText).toHaveBeenCalledWith("<p>Full content</p>");
    });

    it("falls back to summary when content is null", async () => {
      fetchAndParseFeed.mockResolvedValue([
        { ...ITEM, content: null, summary: "Just a summary" }
      ]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" }
      ]);

      await checkFeedsAndSend(env);

      expect(constrainImages).toHaveBeenCalledWith("Just a summary");
    });

    it("uses empty string when both content and summary are null", async () => {
      fetchAndParseFeed.mockResolvedValue([
        { ...ITEM, content: null, summary: null }
      ]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" }
      ]);

      await checkFeedsAndSend(env);

      expect(constrainImages).toHaveBeenCalledWith("");
    });

    it("renders newsletter template with correct data", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" }
      ]);

      await checkFeedsAndSend(env);

      // render calls pass companyName and companyAddress from channel config
      expect(render).toHaveBeenCalledWith("newsletter", {
        title: "Test Post",
        date: "2025-01-15T10:00:00Z",
        link: "https://example.com/post-1",
        content: "<p>Full content</p>",
        hasFullContent: true,
        summary: "A summary",
        siteName: "Test Site",
        siteUrl: "https://example.com",
        unsubscribeUrl: "%%UNSUBSCRIBE_URL%%",
        companyName: undefined,
        companyAddress: undefined
      });
    });

    it("sets hasFullContent to false when content is null", async () => {
      fetchAndParseFeed.mockResolvedValue([{ ...ITEM, content: null }]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" }
      ]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({ hasFullContent: false })
      );
    });
  });

  describe("error handling", () => {
    it("continues to next channel on per-channel error", async () => {
      const site2 = {
        ...CHANNEL,
        id: "channel-2",
        feeds: [{ name: "Other Feed", url: "https://other.com/feed" }]
      };
      getChannels.mockReturnValue([CHANNEL, site2]);

      // First site throws, second site works
      fetchAndParseFeed
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce([ITEM]);

      isItemSent.mockResolvedValue(true); // all items already sent

      await checkFeedsAndSend(env);

      // Should not throw, should continue
      expect(fetchAndParseFeed).toHaveBeenCalledTimes(2);
    });

    it("catches processChannelFeeds error and continues to next channel", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const site2 = {
        ...CHANNEL,
        id: "channel-2",
        feeds: [{ name: "Other Feed", url: "https://other.com/feed" }]
      };
      getChannels.mockReturnValue([CHANNEL, site2]);

      // Both feeds have unseen items
      isItemSent.mockResolvedValue(false);
      fetchAndParseFeed.mockResolvedValue([ITEM]);

      // First channel's getVerifiedSubscribers throws (channel-level error)
      getVerifiedSubscribers
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockResolvedValueOnce([]);

      const result = await checkFeedsAndSend(env);

      // Should not throw, should log error for first channel
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error processing channel"),
        expect.any(Error)
      );
      // Second channel should still process
      expect(result).toBeDefined();

      consoleSpy.mockRestore();
    });

    it("continues to next feed on per-feed error", async () => {
      const site = {
        ...CHANNEL,
        feeds: [
          { name: "Feed 1", url: "https://feed1.com" },
          { name: "Feed 2", url: "https://feed2.com" }
        ]
      };
      getChannels.mockReturnValue([site]);

      fetchAndParseFeed
        .mockRejectedValueOnce(new Error("Feed 1 error"))
        .mockResolvedValueOnce([ITEM]);

      isItemSent.mockResolvedValue(true);

      await checkFeedsAndSend(env);

      expect(fetchAndParseFeed).toHaveBeenCalledTimes(2);
    });
  });

  describe("multiple feeds for one channel", () => {
    it("collects unseen items from all feeds", async () => {
      const item2 = { ...ITEM, id: "item-2", title: "Feed 2 Post" };
      const site = {
        ...CHANNEL,
        feeds: [
          { name: "Feed 1", url: "https://feed1.com" },
          { name: "Feed 2", url: "https://feed2.com" }
        ]
      };
      getChannels.mockReturnValue([site]);

      fetchAndParseFeed
        .mockResolvedValueOnce([ITEM])
        .mockResolvedValueOnce([item2]);

      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" }
      ]);

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(2);
      expect(result.items).toHaveLength(2);
    });
  });

  describe("empty feeds list", () => {
    it("skips channel with empty feeds array without errors", async () => {
      const channelNoFeeds = { ...CHANNEL, feeds: [] };
      getChannels.mockReturnValue([channelNoFeeds]);

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(fetchAndParseFeed).not.toHaveBeenCalled();
    });

    it("skips channel with undefined feeds without errors", async () => {
      const { feeds: _feeds, ...channelNoFeeds } = CHANNEL;
      getChannels.mockReturnValue([channelNoFeeds]);

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(fetchAndParseFeed).not.toHaveBeenCalled();
    });

    it("processes other channels normally when one channel has empty feeds", async () => {
      const channelNoFeeds = { ...CHANNEL, id: "no-feeds", feeds: [] };
      const channelWithFeeds = { ...CHANNEL, id: "has-feeds" };
      getChannels.mockReturnValue([channelNoFeeds, channelWithFeeds]);

      isItemSent.mockResolvedValue(true); // all items already sent

      await checkFeedsAndSend(env);

      expect(fetchAndParseFeed).toHaveBeenCalledTimes(1);
      expect(fetchAndParseFeed).toHaveBeenCalledWith(
        "https://example.com/feed.xml",
        expect.any(String)
      );
    });
  });

  describe("company info in newsletter email footer", () => {
    const subscriber1 = {
      id: 1,
      email: "user1@test.com",
      unsubscribe_token: "unsub-1"
    };

    it("passes companyName and companyAddress to newsletter HTML template when configured", async () => {
      const channelWithCompany = {
        ...CHANNEL,
        companyName: "Acme Corp",
        companyAddress: "123 Main St, Springfield, IL 62701"
      };
      getChannels.mockReturnValue([channelWithCompany]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          companyName: "Acme Corp",
          companyAddress: "123 Main St, Springfield, IL 62701"
        })
      );
    });

    it("passes companyName and companyAddress to newsletter text template when configured", async () => {
      const channelWithCompany = {
        ...CHANNEL,
        companyName: "Acme Corp",
        companyAddress: "123 Main St, Springfield, IL 62701"
      };
      getChannels.mockReturnValue([channelWithCompany]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletterText",
        expect.objectContaining({
          companyName: "Acme Corp",
          companyAddress: "123 Main St, Springfield, IL 62701"
        })
      );
    });

    it("passes undefined companyName and companyAddress when channel has no company info", async () => {
      // Default CHANNEL has no companyName/companyAddress
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          companyName: undefined,
          companyAddress: undefined
        })
      );

      expect(render).toHaveBeenCalledWith(
        "newsletterText",
        expect.objectContaining({
          companyName: undefined,
          companyAddress: undefined
        })
      );
    });

    it("passes empty string companyName when channel has empty string", async () => {
      const channelWithEmpty = {
        ...CHANNEL,
        companyName: "",
        companyAddress: "123 Main St"
      };
      getChannels.mockReturnValue([channelWithEmpty]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          companyName: "",
          companyAddress: "123 Main St"
        })
      );
    });

    it("passes only companyAddress when companyName is not configured", async () => {
      const channelOnlyAddress = {
        ...CHANNEL,
        companyAddress: "456 Oak Ave"
      };
      getChannels.mockReturnValue([channelOnlyAddress]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          companyName: undefined,
          companyAddress: "456 Oak Ave"
        })
      );
    });

    it("passes only companyName when companyAddress is not configured", async () => {
      const channelOnlyName = {
        ...CHANNEL,
        companyName: "Acme Corp"
      };
      getChannels.mockReturnValue([channelOnlyName]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          companyName: "Acme Corp",
          companyAddress: undefined
        })
      );
    });
  });

  describe("newsletter footer layout standardization", () => {
    const subscriber1 = {
      id: 1,
      email: "user1@test.com",
      unsubscribe_token: "unsub-1"
    };

    it("%%UNSUBSCRIBE_URL%% placeholder replacement continues to work", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const emailCall = sendEmail.mock.calls[0];
      // The rendered template mock returns "html with %%UNSUBSCRIBE_URL%%"
      // which should be replaced with the actual per-subscriber URL
      expect(emailCall[1].html).not.toContain("%%UNSUBSCRIBE_URL%%");
      expect(emailCall[1].html).toContain(
        "https://test.example.com/api/unsubscribe?token=unsub-1"
      );
      expect(emailCall[1].text).not.toContain("%%UNSUBSCRIBE_URL%%");
      expect(emailCall[1].text).toContain(
        "https://test.example.com/api/unsubscribe?token=unsub-1"
      );
    });

    it("newsletter HTML template receives unsubscribeUrl as %%UNSUBSCRIBE_URL%% placeholder", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      // The render call for the newsletter template must pass
      // unsubscribeUrl: "%%UNSUBSCRIBE_URL%%" so it can be replaced per-subscriber
      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          unsubscribeUrl: "%%UNSUBSCRIBE_URL%%"
        })
      );
    });

    it("newsletter text template receives unsubscribeUrl as %%UNSUBSCRIBE_URL%% placeholder", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletterText",
        expect.objectContaining({
          unsubscribeUrl: "%%UNSUBSCRIBE_URL%%"
        })
      );
    });

    it("newsletter template receives siteName for copyright line", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      // footer uses siteName for copyright
      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          siteName: "Test Site"
        })
      );
    });

    it("%%UNSUBSCRIBE_URL%% is replaced independently for each subscriber", async () => {
      const subscriber2 = {
        id: 2,
        email: "user2@test.com",
        unsubscribe_token: "unsub-2"
      };
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1, subscriber2]);

      await checkFeedsAndSend(env);

      // First subscriber
      const call1 = sendEmail.mock.calls[0];
      expect(call1[1].html).toContain(
        "https://test.example.com/api/unsubscribe?token=unsub-1"
      );
      expect(call1[1].html).not.toContain("unsub-2");

      // Second subscriber
      const call2 = sendEmail.mock.calls[1];
      expect(call2[1].html).toContain(
        "https://test.example.com/api/unsubscribe?token=unsub-2"
      );
      expect(call2[1].html).not.toContain("unsub-1");
    });
  });
});
