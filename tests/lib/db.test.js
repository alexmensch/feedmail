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

describe("db — channel_id column rename", () => {
  describe("Subscribers use channel_id instead of site_id", () => {
    describe("getSubscriberByEmail", () => {
      it("queries by email and channel_id", async () => {
        const subscriber = { id: 1, email: "a@b.com", channel_id: "ch1" };
        const db = mockDb(subscriber);

        const result = await getSubscriberByEmail(db, "a@b.com", "ch1");

        expect(result).toEqual(subscriber);
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("WHERE email = ? AND channel_id = ?"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("a@b.com", "ch1");
        expect(db._chain.first).toHaveBeenCalled();
      });

      it("does not reference site_id in query", async () => {
        const db = mockDb(null);

        await getSubscriberByEmail(db, "a@b.com", "ch1");

        expect(db.prepare).not.toHaveBeenCalledWith(
          expect.stringContaining("site_id"),
        );
      });
    });

    describe("getVerifiedSubscribers", () => {
      it("filters by channel_id instead of site_id", async () => {
        const subscribers = [{ id: 1, email: "a@b.com" }];
        const db = mockDb({ results: subscribers });

        const result = await getVerifiedSubscribers(db, "ch1");

        expect(result).toEqual(subscribers);
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("channel_id = ?"),
        );
        expect(db.prepare).not.toHaveBeenCalledWith(
          expect.stringContaining("site_id"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("ch1");
      });
    });

    describe("insertSubscriber", () => {
      it("inserts with channel_id instead of site_id", async () => {
        const db = mockDb({ meta: { last_row_id: 42 } });

        await insertSubscriber(db, {
          channelId: "ch1",
          email: "new@test.com",
          verifyToken: "vtok",
          unsubscribeToken: "utok",
        });

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("channel_id"),
        );
        expect(db.prepare).not.toHaveBeenCalledWith(
          expect.stringContaining("site_id"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith(
          "ch1",
          "new@test.com",
          "vtok",
          "utok",
        );
        expect(db._chain.run).toHaveBeenCalled();
      });
    });
  });

  describe("Admin Queries use channel_id", () => {
    describe("getSubscriberStats", () => {
      it("queries by channel_id instead of site_id", async () => {
        const db = mockDb({
          results: [{ status: "verified", count: 10 }],
        });

        await getSubscriberStats(db, "ch1");

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("channel_id = ?"),
        );
        expect(db.prepare).not.toHaveBeenCalledWith(
          expect.stringContaining("site_id"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("ch1");
      });
    });

    describe("getSubscriberList", () => {
      it("queries by channel_id instead of site_id", async () => {
        const db = mockDb({ results: [] });

        await getSubscriberList(db, "ch1", null);

        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining("channel_id = ?"),
        );
        expect(db.prepare).not.toHaveBeenCalledWith(
          expect.stringContaining("site_id"),
        );
        expect(db._chain.bind).toHaveBeenCalledWith("ch1");
      });
    });
  });
});
