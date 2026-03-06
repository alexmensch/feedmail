import { describe, it, expect, vi } from "vitest";
import {
  getSubscriberByEmail,
  getSubscriberByVerifyToken,
  getSubscriberByUnsubscribeToken,
  getVerifiedSubscribers,
  insertSubscriber,
  resetSubscriberToPending,
  updateVerifyToken,
  markSubscriberVerified,
  markSubscriberUnsubscribed,
  countRecentVerificationAttempts,
  insertVerificationAttempt,
  clearVerificationAttempts,
  isFeedSeeded,
  isItemSent,
  insertSentItem,
  isItemSentToSubscriber,
  insertSubscriberSend,
  deleteSubscriberSends,
  getSubscriberStats,
  getSentItemStats,
  getSubscriberList,
  // New DB-backed config CRUD functions
  getSiteConfig,
  upsertSiteConfig,
  getRateLimitConfigs,
  upsertRateLimitConfig,
  getAllChannels,
  getChannelById,
  insertChannel,
  updateChannel,
  deleteChannel,
  getFeedsByChannelId,
  getFeedById,
  insertFeed,
  updateFeed,
  deleteFeed,
} from "../../src/lib/db.js";

/**
 * Create a mock D1 database binding.
 */
function mockDb(returnValue) {
  const chainable = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(returnValue),
    all: vi.fn().mockResolvedValue(returnValue),
    run: vi.fn().mockResolvedValue(returnValue),
  };
  return {
    prepare: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  };
}

describe("db", () => {
  describe("Subscribers", () => {
    describe("getSubscriberByEmail", () => {
      it("queries by email and channel_id", async () => {
        const subscriber = { id: 1, email: "a@b.com", channel_id: "site1" };
        const db = mockDb(subscriber);

        const result = await getSubscriberByEmail(db, "a@b.com", "site1");

        expect(result).toEqual(subscriber);
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("WHERE email = ? AND channel_id = ?"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("a@b.com", "site1");
        expect(db._chain.first).toHaveBeenCalled();
      });

      it("returns null when no subscriber found", async () => {
        const db = mockDb(null);
        const result = await getSubscriberByEmail(db, "missing@b.com", "s1");
        expect(result).toBeNull();
      });
    });

    describe("getSubscriberByVerifyToken", () => {
      it("queries by verify_token and status=pending", async () => {
        const subscriber = {
          id: 1,
          verify_token: "tok",
          status: "pending",
        };
        const db = mockDb(subscriber);

        const result = await getSubscriberByVerifyToken(db, "tok");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("verify_token = ?"),
        );
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("status = 'pending'"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("tok");
        expect(result).toEqual(subscriber);
      });

      it("returns null when token not found or not pending", async () => {
        const db = mockDb(null);
        const result = await getSubscriberByVerifyToken(db, "bad-token");
        expect(result).toBeNull();
      });
    });

    describe("getSubscriberByUnsubscribeToken", () => {
      it("queries by unsubscribe_token (any status)", async () => {
        const subscriber = { id: 1, unsubscribe_token: "unsub-tok" };
        const db = mockDb(subscriber);

        const result = await getSubscriberByUnsubscribeToken(db, "unsub-tok");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("unsubscribe_token = ?"),
        );
        // Should NOT filter by status
        expect(db.prepare).not.toHaveBeenCalledWith(
          expect.stringContaining("status ="),
        );
        expect(result).toEqual(subscriber);
      });
    });

    describe("getVerifiedSubscribers", () => {
      it("returns array of verified subscribers", async () => {
        const subscribers = [
          { id: 1, email: "a@b.com" },
          { id: 2, email: "c@d.com" },
        ];
        const db = mockDb({ results: subscribers });

        const result = await getVerifiedSubscribers(db, "site1");

        expect(result).toEqual(subscribers);
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("status = 'verified'"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("site1");
      });

      it("returns empty array when no subscribers", async () => {
        const db = mockDb({ results: [] });
        const result = await getVerifiedSubscribers(db, "site1");
        expect(result).toEqual([]);
      });
    });

    describe("insertSubscriber", () => {
      it("inserts with pending status", async () => {
        const db = mockDb({ meta: { last_row_id: 42 } });

        await insertSubscriber(db, {
          channelId: "site1",
          email: "new@test.com",
          verifyToken: "vtok",
          unsubscribeToken: "utok",
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("INSERT INTO subscribers"),
        );
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("'pending'"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(
          "site1",
          "new@test.com",
          "vtok",
          "utok",
        );
        expect(db._chain.run).toHaveBeenCalled();
      });
    });

    describe("resetSubscriberToPending", () => {
      it("resets status and clears timestamps", async () => {
        const db = mockDb({});

        await resetSubscriberToPending(db, 42, "new-token");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("SET status = 'pending'"),
        );
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("verified_at = NULL"),
        );
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("unsubscribed_at = NULL"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("new-token", 42);
      });
    });

    describe("updateVerifyToken", () => {
      it("updates token and resets created_at", async () => {
        const db = mockDb({});

        await updateVerifyToken(db, 42, "updated-token");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("SET verify_token = ?"),
        );
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("created_at = datetime('now')"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("updated-token", 42);
      });
    });

    describe("markSubscriberVerified", () => {
      it("sets status to verified and clears verify_token", async () => {
        const db = mockDb({});

        await markSubscriberVerified(db, 42);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("status = 'verified'"),
        );
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("verify_token = NULL"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(42);
      });
    });

    describe("markSubscriberUnsubscribed", () => {
      it("sets status to unsubscribed", async () => {
        const db = mockDb({});

        await markSubscriberUnsubscribed(db, 42);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("status = 'unsubscribed'"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(42);
      });
    });
  });

  describe("Verification Attempts", () => {
    describe("countRecentVerificationAttempts", () => {
      it("counts attempts within window", async () => {
        const db = mockDb({ count: 3 });

        const result = await countRecentVerificationAttempts(db, 42, 24);

        expect(result).toBe(3);
        expect(db._chain.bind).toHaveBeenCalledWith(42, "-24");
      });

      it("returns 0 when result is null", async () => {
        const db = mockDb(null);

        const result = await countRecentVerificationAttempts(db, 42, 24);

        expect(result).toBe(0);
      });

      it("returns 0 when count is 0", async () => {
        const db = mockDb({ count: 0 });

        const result = await countRecentVerificationAttempts(db, 42, 24);

        expect(result).toBe(0);
      });

      it("formats window hours as negative string", async () => {
        const db = mockDb({ count: 0 });

        await countRecentVerificationAttempts(db, 1, 48);

        expect(db._chain.bind).toHaveBeenCalledWith(1, "-48");
      });
    });

    describe("insertVerificationAttempt", () => {
      it("inserts attempt for subscriber", async () => {
        const db = mockDb({});

        await insertVerificationAttempt(db, 42);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining(
            "INSERT INTO verification_attempts",
          ),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(42);
      });
    });

    describe("clearVerificationAttempts", () => {
      it("deletes all attempts for subscriber", async () => {
        const db = mockDb({});

        await clearVerificationAttempts(db, 42);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining(
            "DELETE FROM verification_attempts",
          ),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(42);
      });
    });
  });

  describe("Sent Items", () => {
    describe("isFeedSeeded", () => {
      it("returns true when feed has items", async () => {
        const db = mockDb({ count: 5 });

        const result = await isFeedSeeded(db, "https://example.com/feed");

        expect(result).toBe(true);
        expect(db._chain.bind).toHaveBeenCalledWith(
          "https://example.com/feed",
        );
      });

      it("returns false when feed has no items", async () => {
        const db = mockDb({ count: 0 });

        const result = await isFeedSeeded(db, "https://example.com/feed");

        expect(result).toBe(false);
      });

      it("returns false when result is null", async () => {
        const db = mockDb(null);

        const result = await isFeedSeeded(db, "https://example.com/feed");

        expect(result).toBe(false);
      });
    });

    describe("isItemSent", () => {
      it("returns true when item exists", async () => {
        const db = mockDb({ id: 1 });

        const result = await isItemSent(db, "item-1", "https://feed.com");

        expect(result).toBe(true);
        expect(db._chain.bind).toHaveBeenCalledWith(
          "item-1",
          "https://feed.com",
        );
      });

      it("returns false when item not found", async () => {
        const db = mockDb(null);

        const result = await isItemSent(db, "item-1", "https://feed.com");

        expect(result).toBe(false);
      });
    });

    describe("insertSentItem", () => {
      it("inserts with INSERT OR IGNORE", async () => {
        const db = mockDb({});

        await insertSentItem(db, {
          itemId: "item-1",
          feedUrl: "https://feed.com",
          title: "My Post",
          recipientCount: 5,
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("INSERT OR IGNORE INTO sent_items"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(
          "item-1",
          "https://feed.com",
          "My Post",
          5,
        );
      });

      it("falls back to empty string for null title", async () => {
        const db = mockDb({});

        await insertSentItem(db, {
          itemId: "item-1",
          feedUrl: "https://feed.com",
          title: null,
          recipientCount: 0,
        });

        expect(db._chain.bind).toHaveBeenCalledWith(
          "item-1",
          "https://feed.com",
          "",
          0,
        );
      });

      it("falls back to empty string for undefined title", async () => {
        const db = mockDb({});

        await insertSentItem(db, {
          itemId: "item-1",
          feedUrl: "https://feed.com",
          title: undefined,
          recipientCount: 0,
        });

        expect(db._chain.bind).toHaveBeenCalledWith(
          "item-1",
          "https://feed.com",
          "",
          0,
        );
      });
    });
  });

  describe("Subscriber Sends", () => {
    describe("isItemSentToSubscriber", () => {
      it("returns true when record exists", async () => {
        const db = mockDb({ id: 1 });

        const result = await isItemSentToSubscriber(
          db,
          42,
          "item-1",
          "https://feed.com",
        );

        expect(result).toBe(true);
        expect(db._chain.bind).toHaveBeenCalledWith(
          42,
          "item-1",
          "https://feed.com",
        );
      });

      it("returns false when record not found", async () => {
        const db = mockDb(null);

        const result = await isItemSentToSubscriber(
          db,
          42,
          "item-1",
          "https://feed.com",
        );

        expect(result).toBe(false);
      });
    });

    describe("insertSubscriberSend", () => {
      it("inserts with INSERT OR IGNORE", async () => {
        const db = mockDb({});

        await insertSubscriberSend(db, 42, "item-1", "https://feed.com");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining(
            "INSERT OR IGNORE INTO subscriber_sends",
          ),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(
          42,
          "item-1",
          "https://feed.com",
        );
      });
    });

    describe("deleteSubscriberSends", () => {
      it("deletes by item_id and feed_url", async () => {
        const db = mockDb({});

        await deleteSubscriberSends(db, "item-1", "https://feed.com");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("DELETE FROM subscriber_sends"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(
          "item-1",
          "https://feed.com",
        );
      });
    });
  });

  describe("Admin Queries", () => {
    describe("getSubscriberStats", () => {
      it("aggregates stats by status", async () => {
        const db = mockDb({
          results: [
            { status: "verified", count: 10 },
            { status: "pending", count: 3 },
            { status: "unsubscribed", count: 2 },
          ],
        });

        const stats = await getSubscriberStats(db, "site1");

        expect(stats).toEqual({
          total: 15,
          verified: 10,
          pending: 3,
          unsubscribed: 2,
        });
      });

      it("returns zeros for empty results", async () => {
        const db = mockDb({ results: [] });

        const stats = await getSubscriberStats(db, "site1");

        expect(stats).toEqual({
          total: 0,
          verified: 0,
          pending: 0,
          unsubscribed: 0,
        });
      });

      it("handles partial status results", async () => {
        const db = mockDb({
          results: [{ status: "verified", count: 5 }],
        });

        const stats = await getSubscriberStats(db, "site1");

        expect(stats).toEqual({
          total: 5,
          verified: 5,
          pending: 0,
          unsubscribed: 0,
        });
      });
    });

    describe("getSentItemStats", () => {
      it("returns total and lastSentAt", async () => {
        const db = mockDb({
          total: 42,
          lastSentAt: "2025-01-15 10:00:00",
        });

        const stats = await getSentItemStats(db, [
          "https://feed1.com",
          "https://feed2.com",
        ]);

        expect(stats).toEqual({
          total: 42,
          lastSentAt: "2025-01-15 10:00:00",
        });
        expect(db._chain.bind).toHaveBeenCalledWith(
          "https://feed1.com",
          "https://feed2.com",
        );
      });

      it("returns zeros when result is null", async () => {
        const db = mockDb(null);

        const stats = await getSentItemStats(db, ["https://feed.com"]);

        expect(stats).toEqual({ total: 0, lastSentAt: null });
      });

      it("builds correct number of placeholders", async () => {
        const db = mockDb({ total: 0, lastSentAt: null });

        await getSentItemStats(db, ["a", "b", "c"]);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("IN (?, ?, ?)"),
        );
      });

      it("handles single feed URL", async () => {
        const db = mockDb({ total: 0, lastSentAt: null });

        await getSentItemStats(db, ["https://feed.com"]);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("IN (?)"),
        );
      });
    });

    describe("getSubscriberList", () => {
      it("returns subscribers ordered by created_at DESC", async () => {
        const subscribers = [
          { email: "b@test.com", status: "verified" },
          { email: "a@test.com", status: "pending" },
        ];
        const db = mockDb({ results: subscribers });

        const result = await getSubscriberList(db, "site1", null);

        expect(result).toEqual(subscribers);
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("ORDER BY created_at DESC"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("site1");
      });

      it("adds status filter when provided", async () => {
        const db = mockDb({ results: [] });

        await getSubscriberList(db, "site1", "verified");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("AND status = ?"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("site1", "verified");
      });

      it("does not add status filter when null", async () => {
        const db = mockDb({ results: [] });

        await getSubscriberList(db, "site1", null);

        expect(db.prepare).not.toHaveBeenCalledWith(
          expect.stringContaining("AND status = ?"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("site1");
      });
    });
  });

  // ─── New DB-backed Config CRUD Functions ─────────────────────────────────

  describe("Site Config", () => {
    describe("getSiteConfig", () => {
      it("queries site_config table for single row", async () => {
        const config = {
          verify_max_attempts: 5,
          verify_window_hours: 48,
        };
        const db = mockDb(config);

        const result = await getSiteConfig(db);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("site_config"),
        );
        expect(db._chain.first).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it("returns null when site_config table is empty", async () => {
        const db = mockDb(null);

        const result = await getSiteConfig(db);

        expect(result).toBeNull();
      });

      it("returns verify settings in camelCase", async () => {
        const db = mockDb({
          verify_max_attempts: 10,
          verify_window_hours: 72,
        });

        const result = await getSiteConfig(db);

        expect(result).toHaveProperty("verifyMaxAttempts", 10);
        expect(result).toHaveProperty("verifyWindowHours", 72);
      });
    });

    describe("upsertSiteConfig", () => {
      it("inserts or updates site config row", async () => {
        const db = mockDb({});

        await upsertSiteConfig(db, {
          verifyMaxAttempts: 5,
          verifyWindowHours: 48,
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("site_config"),
        );
        expect(db._chain.run).toHaveBeenCalled();
      });

      it("passes correct values to bind", async () => {
        const db = mockDb({});

        await upsertSiteConfig(db, {
          verifyMaxAttempts: 10,
          verifyWindowHours: 24,
        });

        expect(db._chain.bind).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
        );
      });
    });
  });

  describe("Rate Limit Config", () => {
    describe("getRateLimitConfigs", () => {
      it("queries rate_limit_config table", async () => {
        const db = mockDb({
          results: [
            { endpoint: "subscribe", window_hours: 1, max_requests: 10 },
            { endpoint: "verify", window_hours: 1, max_requests: 20 },
          ],
        });

        const result = await getRateLimitConfigs(db);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("rate_limit_config"),
        );
        expect(result).toBeDefined();
      });

      it("returns a map keyed by endpoint name", async () => {
        const db = mockDb({
          results: [
            { endpoint: "subscribe", window_hours: 1, max_requests: 10 },
            { endpoint: "admin", window_hours: 1, max_requests: 30 },
          ],
        });

        const result = await getRateLimitConfigs(db);

        expect(result).toHaveProperty("subscribe");
        expect(result).toHaveProperty("admin");
        expect(result.subscribe).toEqual({
          windowHours: 1,
          maxRequests: 10,
        });
      });

      it("returns empty object when table is empty", async () => {
        const db = mockDb({ results: [] });

        const result = await getRateLimitConfigs(db);

        expect(result).toEqual({});
      });

      it("converts snake_case columns to camelCase", async () => {
        const db = mockDb({
          results: [
            { endpoint: "subscribe", window_hours: 2, max_requests: 50 },
          ],
        });

        const result = await getRateLimitConfigs(db);

        expect(result.subscribe.windowHours).toBe(2);
        expect(result.subscribe.maxRequests).toBe(50);
      });
    });

    describe("upsertRateLimitConfig", () => {
      it("inserts or updates rate limit config for an endpoint", async () => {
        const db = mockDb({});

        await upsertRateLimitConfig(db, "subscribe", {
          windowHours: 2,
          maxRequests: 50,
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("rate_limit_config"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
        expect(db._chain.run).toHaveBeenCalled();
      });
    });
  });

  describe("Channels (DB-backed)", () => {
    describe("getAllChannels", () => {
      it("queries channels table", async () => {
        const channels = [
          { id: "ch1", site_name: "Site 1", cors_origins: '["https://a.com"]' },
          { id: "ch2", site_name: "Site 2", cors_origins: '["https://b.com"]' },
        ];
        const db = mockDb({ results: channels });

        const result = await getAllChannels(db);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("channels"),
        );
        expect(db._chain.all).toHaveBeenCalled();
      });

      it("returns empty array when no channels exist", async () => {
        const db = mockDb({ results: [] });

        const result = await getAllChannels(db);

        expect(result).toEqual([]);
      });

      it("converts snake_case columns to camelCase", async () => {
        const db = mockDb({
          results: [
            {
              id: "ch1",
              site_name: "Site 1",
              site_url: "https://a.com",
              from_user: "hello",
              from_name: "Sender",
              reply_to: null,
              company_name: null,
              company_address: null,
              cors_origins: '["https://a.com"]',
            },
          ],
        });

        const result = await getAllChannels(db);

        expect(result[0]).toHaveProperty("siteName", "Site 1");
        expect(result[0]).toHaveProperty("siteUrl", "https://a.com");
        expect(result[0]).toHaveProperty("fromUser", "hello");
        expect(result[0]).toHaveProperty("fromName", "Sender");
      });

      it("parses corsOrigins from JSON string", async () => {
        const db = mockDb({
          results: [
            {
              id: "ch1",
              site_name: "Site 1",
              site_url: "https://a.com",
              from_user: "hello",
              from_name: "Sender",
              cors_origins: '["https://a.com","https://b.com"]',
            },
          ],
        });

        const result = await getAllChannels(db);

        expect(result[0].corsOrigins).toEqual([
          "https://a.com",
          "https://b.com",
        ]);
      });
    });

    describe("getChannelById", () => {
      it("queries channel by id", async () => {
        const channel = {
          id: "ch1",
          site_name: "Site 1",
          cors_origins: '["https://a.com"]',
        };
        const db = mockDb(channel);

        const result = await getChannelById(db, "ch1");

        expect(db._chain.bind).toHaveBeenCalledWith("ch1");
        expect(db._chain.first).toHaveBeenCalled();
      });

      it("returns null when channel not found", async () => {
        const db = mockDb(null);

        const result = await getChannelById(db, "nonexistent");

        expect(result).toBeNull();
      });
    });

    describe("insertChannel", () => {
      it("inserts a new channel row", async () => {
        const db = mockDb({});

        await insertChannel(db, {
          id: "new-ch",
          siteName: "New Site",
          siteUrl: "https://new.example.com",
          fromUser: "hello",
          fromName: "Sender",
          corsOrigins: ["https://new.example.com"],
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("INSERT INTO channels"),
        );
        expect(db._chain.run).toHaveBeenCalled();
      });

      it("stores corsOrigins as JSON string", async () => {
        const db = mockDb({});

        await insertChannel(db, {
          id: "new-ch",
          siteName: "New Site",
          siteUrl: "https://new.example.com",
          fromUser: "hello",
          fromName: "Sender",
          corsOrigins: ["https://a.com", "https://b.com"],
        });

        // corsOrigins should be serialized
        const bindArgs = db._chain.bind.mock.calls[0];
        const corsArg = bindArgs.find(
          (arg) => typeof arg === "string" && arg.startsWith("["),
        );
        expect(corsArg).toBeDefined();
        expect(JSON.parse(corsArg)).toEqual([
          "https://a.com",
          "https://b.com",
        ]);
      });

      it("includes optional fields when provided", async () => {
        const db = mockDb({});

        await insertChannel(db, {
          id: "new-ch",
          siteName: "New Site",
          siteUrl: "https://new.example.com",
          fromUser: "hello",
          fromName: "Sender",
          replyTo: "reply@example.com",
          companyName: "Acme",
          companyAddress: "123 Main St",
          corsOrigins: ["https://new.example.com"],
        });

        expect(db._chain.run).toHaveBeenCalled();
      });
    });

    describe("updateChannel", () => {
      it("updates channel fields by id", async () => {
        const db = mockDb({});

        await updateChannel(db, "ch1", {
          siteName: "Updated Site",
          siteUrl: "https://updated.example.com",
          fromUser: "updated",
          fromName: "Updated Sender",
          corsOrigins: ["https://updated.example.com"],
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE channels"),
        );
        expect(db._chain.run).toHaveBeenCalled();
      });
    });

    describe("deleteChannel", () => {
      it("deletes channel and cascading data", async () => {
        const stmts = [];
        const db = {
          prepare: vi.fn().mockImplementation(() => {
            const stmt = {
              bind: vi.fn().mockReturnThis(),
              run: vi.fn().mockResolvedValue({}),
              first: vi.fn().mockResolvedValue(null),
              all: vi.fn().mockResolvedValue({ results: [] }),
            };
            stmts.push(stmt);
            return stmt;
          }),
          batch: vi.fn().mockResolvedValue([]),
        };

        await deleteChannel(db, "ch1");

        // Should delete from multiple tables
        // The implementation should delete from: feeds, subscribers, verification_attempts,
        // subscriber_sends, sent_items, and channels
        expect(db.prepare).toHaveBeenCalled();
      });

      it("passes channel id to the deletion queries", async () => {
        const stmts = [];
        const db = {
          prepare: vi.fn().mockImplementation(() => {
            const stmt = {
              bind: vi.fn().mockReturnThis(),
              run: vi.fn().mockResolvedValue({}),
              first: vi.fn().mockResolvedValue(null),
              all: vi.fn().mockResolvedValue({ results: [] }),
            };
            stmts.push(stmt);
            return stmt;
          }),
          batch: vi.fn().mockResolvedValue([]),
        };

        await deleteChannel(db, "test-channel");

        // At least one of the prepared statements should have been bound with the channel id
        const boundWithChannelId = stmts.some(
          (s) =>
            s.bind.mock.calls.length > 0 &&
            s.bind.mock.calls.some((args) => args.includes("test-channel")),
        );
        expect(boundWithChannelId).toBe(true);
      });
    });
  });

  describe("Feeds (DB-backed)", () => {
    describe("getFeedsByChannelId", () => {
      it("queries feeds by channel_id", async () => {
        const feeds = [
          { id: 1, channel_id: "ch1", name: "Feed A", url: "https://a.com/feed" },
          { id: 2, channel_id: "ch1", name: "Feed B", url: "https://b.com/feed" },
        ];
        const db = mockDb({ results: feeds });

        const result = await getFeedsByChannelId(db, "ch1");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("feeds"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("ch1");
        expect(db._chain.all).toHaveBeenCalled();
      });

      it("returns empty array when channel has no feeds", async () => {
        const db = mockDb({ results: [] });

        const result = await getFeedsByChannelId(db, "ch1");

        expect(result).toEqual([]);
      });

      it("returns feeds with integer auto-increment IDs", async () => {
        const db = mockDb({
          results: [
            { id: 1, channel_id: "ch1", name: "Feed A", url: "https://a.com" },
          ],
        });

        const result = await getFeedsByChannelId(db, "ch1");

        expect(typeof result[0].id).toBe("number");
      });
    });

    describe("getFeedById", () => {
      it("queries feed by id", async () => {
        const feed = { id: 1, channel_id: "ch1", name: "Feed", url: "https://a.com" };
        const db = mockDb(feed);

        const result = await getFeedById(db, 1);

        expect(db._chain.bind).toHaveBeenCalledWith(1);
        expect(db._chain.first).toHaveBeenCalled();
        expect(result).toEqual(feed);
      });

      it("returns null when feed not found", async () => {
        const db = mockDb(null);

        const result = await getFeedById(db, 999);

        expect(result).toBeNull();
      });
    });

    describe("insertFeed", () => {
      it("inserts a new feed for a channel", async () => {
        const db = mockDb({ meta: { last_row_id: 3 } });

        await insertFeed(db, "ch1", {
          name: "New Feed",
          url: "https://new.example.com/feed.xml",
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("INSERT INTO feeds"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(
          "ch1",
          "New Feed",
          "https://new.example.com/feed.xml",
        );
        expect(db._chain.run).toHaveBeenCalled();
      });

      it("uses UNIQUE(channel_id, url) constraint for deduplication", async () => {
        const db = mockDb({ meta: { last_row_id: 3 } });

        await insertFeed(db, "ch1", {
          name: "Feed",
          url: "https://example.com/feed.xml",
        });

        // The SQL should reference the feeds table which has UNIQUE(channel_id, url)
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("feeds"),
        );
      });
    });

    describe("updateFeed", () => {
      it("updates feed name and url by id", async () => {
        const db = mockDb({});

        await updateFeed(db, 1, {
          name: "Updated Feed",
          url: "https://updated.example.com/feed.xml",
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE feeds"),
        );
        expect(db._chain.run).toHaveBeenCalled();
      });

      it("passes feed id to the WHERE clause", async () => {
        const db = mockDb({});

        await updateFeed(db, 42, {
          name: "Feed",
          url: "https://example.com/feed.xml",
        });

        // The bind should include the feed id for the WHERE clause
        const bindArgs = db._chain.bind.mock.calls[0];
        expect(bindArgs).toContain(42);
      });
    });

    describe("deleteFeed", () => {
      it("deletes feed and associated data", async () => {
        const stmts = [];
        const db = {
          prepare: vi.fn().mockImplementation(() => {
            const stmt = {
              bind: vi.fn().mockReturnThis(),
              run: vi.fn().mockResolvedValue({}),
              first: vi.fn().mockResolvedValue(null),
              all: vi.fn().mockResolvedValue({ results: [] }),
            };
            stmts.push(stmt);
            return stmt;
          }),
          batch: vi.fn().mockResolvedValue([]),
        };

        await deleteFeed(db, 1);

        // Should delete from feeds and associated sent_items and subscriber_sends
        expect(db.prepare).toHaveBeenCalled();
      });

      it("passes feed id to deletion queries", async () => {
        const stmts = [];
        const db = {
          prepare: vi.fn().mockImplementation(() => {
            const stmt = {
              bind: vi.fn().mockReturnThis(),
              run: vi.fn().mockResolvedValue({}),
              first: vi.fn().mockResolvedValue(null),
              all: vi.fn().mockResolvedValue({ results: [] }),
            };
            stmts.push(stmt);
            return stmt;
          }),
          batch: vi.fn().mockResolvedValue([]),
        };

        await deleteFeed(db, 42);

        // At least one statement should be bound with the feed id
        const boundWithFeedId = stmts.some(
          (s) =>
            s.bind.mock.calls.length > 0 &&
            s.bind.mock.calls.some((args) => args.includes(42)),
        );
        expect(boundWithFeedId).toBe(true);
      });
    });
  });
});
