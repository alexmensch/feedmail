import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
  getSites: vi.fn(),
  getSiteById: vi.fn(),
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
import { getSites, getSiteById } from "../../src/lib/config.js";
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

const SITE = {
  id: "test-site",
  url: "https://example.com",
  name: "Test Site",
  fromEmail: "hello@example.com",
  fromName: "Test",
  replyTo: "reply@example.com",
  feeds: ["https://example.com/feed.xml"],
};

const ITEM = {
  id: "item-1",
  title: "Test Post",
  link: "https://example.com/post-1",
  date: "2025-01-15T10:00:00Z",
  content: "<p>Full content</p>",
  summary: "A summary",
};

const env = {
  DB: {},
  RESEND_API_KEY: "re_test",
  BASE_URL: "https://feedmail.cc",
  SITES: JSON.stringify([SITE]),
};

describe("handleSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSites.mockReturnValue([SITE]);
    getSiteById.mockReturnValue(SITE);
    isFeedSeeded.mockResolvedValue(true);
    isItemSent.mockResolvedValue(true);
    fetchAndParseFeed.mockResolvedValue([ITEM]);
    getVerifiedSubscribers.mockResolvedValue([]);
    sendEmail.mockResolvedValue({ success: true });
    isItemSentToSubscriber.mockResolvedValue(false);
  });

  it("returns JSON response with summary", async () => {
    const request = new Request("https://feedmail.cc/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await handleSend(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("sent");
    expect(body).toHaveProperty("items");
  });

  it("filters by siteId when provided", async () => {
    const request = new Request("https://feedmail.cc/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: "test-site" }),
    });

    await handleSend(request, env);

    // checkFeedsAndSend should be called with targetSiteId
    expect(getSites).toHaveBeenCalled();
  });

  it("handles invalid JSON body gracefully", async () => {
    const request = new Request("https://feedmail.cc/api/send", {
      method: "POST",
      body: "not json",
    });

    const response = await handleSend(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    // Should process all sites (targetSiteId is null)
    expect(body).toHaveProperty("sent");
  });

  it("handles empty body", async () => {
    const request = new Request("https://feedmail.cc/api/send", {
      method: "POST",
    });

    const response = await handleSend(request, env);

    expect(response.status).toBe(200);
  });
});

describe("checkFeedsAndSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSites.mockReturnValue([SITE]);
    isFeedSeeded.mockResolvedValue(true);
    isItemSent.mockResolvedValue(true);
    fetchAndParseFeed.mockResolvedValue([ITEM]);
    getVerifiedSubscribers.mockResolvedValue([]);
    sendEmail.mockResolvedValue({ success: true });
    isItemSentToSubscriber.mockResolvedValue(false);
  });

  describe("site filtering", () => {
    it("processes all sites when targetSiteId is null", async () => {
      const site2 = { ...SITE, id: "site-2", feeds: ["https://other.com/feed"] };
      getSites.mockReturnValue([SITE, site2]);

      await checkFeedsAndSend(env, null);

      // fetchAndParseFeed should be called for both sites' feeds
      expect(fetchAndParseFeed).toHaveBeenCalledTimes(2);
    });

    it("processes only matching site when targetSiteId is set", async () => {
      const site2 = { ...SITE, id: "site-2", feeds: ["https://other.com/feed"] };
      getSites.mockReturnValue([SITE, site2]);

      await checkFeedsAndSend(env, "test-site");

      expect(fetchAndParseFeed).toHaveBeenCalledTimes(1);
      expect(fetchAndParseFeed).toHaveBeenCalledWith(
        "https://example.com/feed.xml",
        expect.any(String),
      );
    });

    it("skips non-matching sites", async () => {
      getSites.mockReturnValue([SITE]);

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
        recipientCount: 0,
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("does not send emails during seeding", async () => {
      isFeedSeeded.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "tok" },
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

      const result = await checkFeedsAndSend(env);

      // No subscribers, so items marked as sent with 0 recipients
      expect(insertSentItem).toHaveBeenCalledWith(env.DB, {
        itemId: "item-1",
        feedUrl: "https://example.com/feed.xml",
        title: "Test Post",
        recipientCount: 0,
      });
    });
  });

  describe("no subscribers", () => {
    it("marks items as sent with 0 recipients when no subscribers", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([]);

      await checkFeedsAndSend(env);

      expect(insertSentItem).toHaveBeenCalledWith(env.DB, expect.objectContaining({
        recipientCount: 0,
      }));
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("sending to subscribers", () => {
    const subscriber1 = {
      id: 1,
      email: "user1@test.com",
      unsubscribe_token: "unsub-1",
    };
    const subscriber2 = {
      id: 2,
      email: "user2@test.com",
      unsubscribe_token: "unsub-2",
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
        "https://feedmail.cc/api/unsubscribe?token=unsub-1",
      );
      expect(emailCall[1].html).not.toContain("%%UNSUBSCRIBE_URL%%");
      expect(emailCall[1].text).toContain(
        "https://feedmail.cc/api/unsubscribe?token=unsub-1",
      );
    });

    it("includes List-Unsubscribe headers per subscriber", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([subscriber1]);

      await checkFeedsAndSend(env);

      const headers = sendEmail.mock.calls[0][1].headers;
      expect(headers["List-Unsubscribe"]).toBe(
        "<https://feedmail.cc/api/unsubscribe?token=unsub-1>",
      );
      expect(headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
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
        "https://example.com/feed.xml",
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
        recipientCount: 1,
      });
      expect(deleteSubscriberSends).toHaveBeenCalledWith(
        env.DB,
        "item-1",
        "https://example.com/feed.xml",
      );
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

      sendEmail
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({
          success: false,
          quotaExhausted: true,
          error: "Rate limited",
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
          error: "Invalid address",
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
        error: "Rate limited",
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
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" },
      ]);

      await checkFeedsAndSend(env);

      expect(constrainImages).toHaveBeenCalledWith("<p>Full content</p>");
      expect(htmlToText).toHaveBeenCalledWith("<p>Full content</p>");
    });

    it("falls back to summary when content is null", async () => {
      fetchAndParseFeed.mockResolvedValue([
        { ...ITEM, content: null, summary: "Just a summary" },
      ]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" },
      ]);

      await checkFeedsAndSend(env);

      expect(constrainImages).toHaveBeenCalledWith("Just a summary");
    });

    it("uses empty string when both content and summary are null", async () => {
      fetchAndParseFeed.mockResolvedValue([
        { ...ITEM, content: null, summary: null },
      ]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" },
      ]);

      await checkFeedsAndSend(env);

      expect(constrainImages).toHaveBeenCalledWith("");
    });

    it("renders newsletter template with correct data", async () => {
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" },
      ]);

      await checkFeedsAndSend(env);

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
      });
    });

    it("sets hasFullContent to false when content is null", async () => {
      fetchAndParseFeed.mockResolvedValue([
        { ...ITEM, content: null },
      ]);
      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" },
      ]);

      await checkFeedsAndSend(env);

      expect(render).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({ hasFullContent: false }),
      );
    });
  });

  describe("error handling", () => {
    it("continues to next site on per-site error", async () => {
      const site2 = {
        ...SITE,
        id: "site-2",
        feeds: ["https://other.com/feed"],
      };
      getSites.mockReturnValue([SITE, site2]);

      // First site throws, second site works
      fetchAndParseFeed
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce([ITEM]);

      isItemSent.mockResolvedValue(true); // all items already sent

      const result = await checkFeedsAndSend(env);

      // Should not throw, should continue
      expect(fetchAndParseFeed).toHaveBeenCalledTimes(2);
    });

    it("continues to next feed on per-feed error", async () => {
      const site = {
        ...SITE,
        feeds: ["https://feed1.com", "https://feed2.com"],
      };
      getSites.mockReturnValue([site]);

      fetchAndParseFeed
        .mockRejectedValueOnce(new Error("Feed 1 error"))
        .mockResolvedValueOnce([ITEM]);

      isItemSent.mockResolvedValue(true);

      const result = await checkFeedsAndSend(env);

      expect(fetchAndParseFeed).toHaveBeenCalledTimes(2);
    });
  });

  describe("multiple feeds for one site", () => {
    it("collects unseen items from all feeds", async () => {
      const item2 = { ...ITEM, id: "item-2", title: "Feed 2 Post" };
      const site = {
        ...SITE,
        feeds: ["https://feed1.com", "https://feed2.com"],
      };
      getSites.mockReturnValue([site]);

      fetchAndParseFeed
        .mockResolvedValueOnce([ITEM])
        .mockResolvedValueOnce([item2]);

      isItemSent.mockResolvedValue(false);
      getVerifiedSubscribers.mockResolvedValue([
        { id: 1, email: "a@b.com", unsubscribe_token: "u1" },
      ]);

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(2);
      expect(result.items).toHaveLength(2);
    });
  });

  describe("empty feeds list", () => {
    it("skips site with empty feeds array without errors", async () => {
      const siteNoFeeds = { ...SITE, feeds: [] };
      getSites.mockReturnValue([siteNoFeeds]);

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(fetchAndParseFeed).not.toHaveBeenCalled();
    });

    it("skips site with undefined feeds without errors", async () => {
      const { feeds, ...siteNoFeeds } = SITE;
      getSites.mockReturnValue([siteNoFeeds]);

      const result = await checkFeedsAndSend(env);

      expect(result.sent).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(fetchAndParseFeed).not.toHaveBeenCalled();
    });

    it("processes other sites normally when one site has empty feeds", async () => {
      const siteNoFeeds = { ...SITE, id: "no-feeds", feeds: [] };
      const siteWithFeeds = { ...SITE, id: "has-feeds" };
      getSites.mockReturnValue([siteNoFeeds, siteWithFeeds]);

      isItemSent.mockResolvedValue(true); // all items already sent

      const result = await checkFeedsAndSend(env);

      expect(fetchAndParseFeed).toHaveBeenCalledTimes(1);
      expect(fetchAndParseFeed).toHaveBeenCalledWith(
        "https://example.com/feed.xml",
        expect.any(String),
      );
    });
  });
});
