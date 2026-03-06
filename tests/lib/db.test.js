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
});
