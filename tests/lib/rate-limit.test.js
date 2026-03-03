import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RATE_LIMITS,
  STALE_ROW_MAX_AGE_SECONDS,
  CLEANUP_PROBABILITY,
  checkRateLimit,
  cleanupStaleRateLimits,
  getEndpointName,
} from "../../src/lib/rate-limit.js";

/**
 * Create a mock D1 database that supports multiple prepare() calls.
 * Each call to prepare() returns a new chainable statement.
 * @param {object} countResult - The result returned by the count query's .first()
 * @returns {{ prepare: Function, _stmts: Array }}
 */
function mockDb(countResult = { count: 0, oldest: null }) {
  const stmts = [];
  const db = {
    prepare: vi.fn().mockImplementation(() => {
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({}),
        first: vi.fn().mockResolvedValue(countResult),
      };
      stmts.push(stmt);
      return stmt;
    }),
    _stmts: stmts,
  };
  return db;
}

/**
 * Create a mock D1 database where the first prepare() call (stale cleanup)
 * uses a custom run() promise, and all subsequent calls resolve normally.
 * @param {Promise} cleanupRun - Promise returned by the stale cleanup's .run()
 * @returns {{ prepare: Function }}
 */
function mockDbWithCleanupBehavior(cleanupRun) {
  let callCount = 0;
  return {
    prepare: vi.fn().mockImplementation(() => {
      const isStaleCleanup = callCount++ === 0;
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockReturnValue(isStaleCleanup ? cleanupRun : Promise.resolve({})),
        first: vi.fn().mockResolvedValue({ count: 0, oldest: null }),
      };
    }),
  };
}

describe("RATE_LIMITS config", () => {
  it("has entries for all five endpoints", () => {
    expect(RATE_LIMITS).toHaveProperty("subscribe");
    expect(RATE_LIMITS).toHaveProperty("verify");
    expect(RATE_LIMITS).toHaveProperty("unsubscribe");
    expect(RATE_LIMITS).toHaveProperty("send");
    expect(RATE_LIMITS).toHaveProperty("admin");
  });

  it("all entries have positive maxRequests and windowSeconds", () => {
    for (const [name, config] of Object.entries(RATE_LIMITS)) {
      expect(config.maxRequests, `${name}.maxRequests`).toBeGreaterThan(0);
      expect(config.windowSeconds, `${name}.windowSeconds`).toBeGreaterThan(0);
      expect(Number.isInteger(config.maxRequests), `${name}.maxRequests is integer`).toBe(true);
      expect(Number.isInteger(config.windowSeconds), `${name}.windowSeconds is integer`).toBe(true);
    }
  });
});

describe("STALE_ROW_MAX_AGE_SECONDS", () => {
  it("is a positive integer", () => {
    expect(typeof STALE_ROW_MAX_AGE_SECONDS).toBe("number");
    expect(Number.isInteger(STALE_ROW_MAX_AGE_SECONDS)).toBe(true);
    expect(STALE_ROW_MAX_AGE_SECONDS).toBeGreaterThan(0);
  });
});

describe("CLEANUP_PROBABILITY", () => {
  it("is in the open interval (0, 1)", () => {
    expect(CLEANUP_PROBABILITY).toBeGreaterThan(0);
    expect(CLEANUP_PROBABILITY).toBeLessThan(1);
  });
});

describe("cleanupStaleRateLimits", () => {
  it("calls db.prepare with the stale-row DELETE SQL", async () => {
    const db = mockDb();
    await cleanupStaleRateLimits(db);
    expect(db.prepare).toHaveBeenCalledWith(
      "DELETE FROM rate_limits WHERE requested_at < datetime('now', ? || ' seconds')",
    );
  });

  it("binds with the negative STALE_ROW_MAX_AGE_SECONDS value", async () => {
    const db = mockDb();
    await cleanupStaleRateLimits(db);
    expect(db._stmts[0].bind).toHaveBeenCalledWith(`-${STALE_ROW_MAX_AGE_SECONDS}`);
  });

  it("calls .run() and returns its result", async () => {
    const db = mockDb();
    const result = await cleanupStaleRateLimits(db);
    expect(db._stmts[0].run).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("propagates rejection from .run()", async () => {
    const err = new Error("DB error");
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockRejectedValue(err),
        first: vi.fn(),
      }),
    };
    await expect(cleanupStaleRateLimits(db)).rejects.toThrow("DB error");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when count is 0", async () => {
    const db = mockDb({ count: 0, oldest: null });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it("allows request when count is below max", async () => {
    const db = mockDb({ count: 5, oldest: "2025-01-01 12:00:00" });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(true);
  });

  it("denies request when count equals max", async () => {
    const now = new Date();
    const oldest = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ count: 10, oldest: oldestStr });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("denies request when count exceeds max", async () => {
    const now = new Date();
    const oldest = new Date(now.getTime() - 10 * 60 * 1000); // 10 min ago
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ count: 15, oldest: oldestStr });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
  });

  it("returns retryAfter based on oldest request expiry plus jitter", async () => {
    const now = new Date();
    // Oldest request was 45 minutes ago, window is 1 hour
    // So base retryAfter should be ~900 seconds, plus 0-30s jitter
    const oldest = new Date(now.getTime() - 45 * 60 * 1000);
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ count: 10, oldest: oldestStr });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    // ~900 base + 0-30 jitter = 895-935 (with timing tolerance)
    expect(result.retryAfter).toBeGreaterThanOrEqual(895);
    expect(result.retryAfter).toBeLessThanOrEqual(935);
  });

  it("adds random jitter between 0 and 30 seconds to retryAfter", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

    const now = new Date();
    const oldest = new Date(now.getTime() - 45 * 60 * 1000);
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ count: 10, oldest: oldestStr });
    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    // Base ~900 + jitter floor(0.5 * 31) = 15 → ~915
    expect(result.retryAfter).toBeGreaterThanOrEqual(910);
    expect(result.retryAfter).toBeLessThanOrEqual(920);

    randomSpy.mockRestore();
  });

  it("adds up to 30 seconds of jitter when Math.random is near 1", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);

    const now = new Date();
    const oldest = new Date(now.getTime() - 45 * 60 * 1000);
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ count: 10, oldest: oldestStr });
    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    // Base ~900 + jitter floor(0.999 * 31) = 30 → ~930
    expect(result.retryAfter).toBeGreaterThanOrEqual(925);
    expect(result.retryAfter).toBeLessThanOrEqual(935);

    randomSpy.mockRestore();
  });

  it("returns retryAfter of at least 1 second", async () => {
    const now = new Date();
    // Oldest request was 59 minutes 59 seconds ago, window is 1 hour
    // retryAfter would be ~1 second
    const oldest = new Date(now.getTime() - (3600 * 1000 - 500));
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ count: 10, oldest: oldestStr });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("cleans up expired rows before checking count", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const db = mockDb({ count: 0, oldest: null });

    await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    // First prepare call is the cleanup DELETE
    expect(db._stmts.length).toBeGreaterThanOrEqual(2);
    const cleanupStmt = db._stmts[0];
    expect(cleanupStmt.bind).toHaveBeenCalledWith("1.2.3.4", "subscribe", "-3600");
    expect(cleanupStmt.run).toHaveBeenCalled();

    randomSpy.mockRestore();
  });

  it("inserts new row when request is allowed", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const db = mockDb({ count: 0, oldest: null });

    await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    // Third prepare call is the INSERT
    expect(db._stmts.length).toBe(3);
    const insertStmt = db._stmts[2];
    expect(insertStmt.bind).toHaveBeenCalledWith("1.2.3.4", "subscribe");
    expect(insertStmt.run).toHaveBeenCalled();

    randomSpy.mockRestore();
  });

  it("does NOT insert row when request is denied", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const now = new Date();
    const oldest = new Date(now.getTime() - 30 * 60 * 1000);
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ count: 10, oldest: oldestStr });

    await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    // Only 2 prepare calls: cleanup + count (no insert)
    expect(db._stmts.length).toBe(2);

    randomSpy.mockRestore();
  });

  it("handles null count result gracefully", async () => {
    const db = mockDb(null);

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(true);
  });

  it("passes correct bind parameters for count query", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const db = mockDb({ count: 0, oldest: null });

    await checkRateLimit(db, "10.0.0.1", "admin", 30, 7200);

    // Second prepare call is the count SELECT
    const countStmt = db._stmts[1];
    expect(countStmt.bind).toHaveBeenCalledWith("10.0.0.1", "admin", "-7200");
    expect(countStmt.first).toHaveBeenCalled();

    randomSpy.mockRestore();
  });

  describe("probabilistic stale cleanup", () => {
    it("triggers global stale cleanup when Math.random < CLEANUP_PROBABILITY", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.009);
      const db = mockDb({ count: 0, oldest: null });

      await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      // With global cleanup triggered: stale DELETE + per-IP DELETE + count + insert = 4 stmts
      expect(db._stmts.length).toBe(4);
      // stmt[0] is the stale cleanup — bound with the max age, not an IP
      expect(db._stmts[0].bind).toHaveBeenCalledWith(`-${STALE_ROW_MAX_AGE_SECONDS}`);

      randomSpy.mockRestore();
    });

    it("triggers when Math.random returns 0 (lower boundary)", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      const db = mockDb({ count: 0, oldest: null });

      await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      expect(db._stmts.length).toBe(4);

      randomSpy.mockRestore();
    });

    it("does not trigger global cleanup when Math.random >= CLEANUP_PROBABILITY", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
      const db = mockDb({ count: 0, oldest: null });

      await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      // Without global cleanup: per-IP DELETE + count + insert = 3 stmts
      expect(db._stmts.length).toBe(3);

      randomSpy.mockRestore();
    });

    it("does not trigger when Math.random equals CLEANUP_PROBABILITY (upper boundary)", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(CLEANUP_PROBABILITY);
      const db = mockDb({ count: 0, oldest: null });

      await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      expect(db._stmts.length).toBe(3);

      randomSpy.mockRestore();
    });

    it("global cleanup is fire-and-forget and does not block request handling", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      // Stale cleanup run() never resolves — would hang checkRateLimit if awaited
      const db = mockDbWithCleanupBehavior(new Promise(() => {}));

      const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      // checkRateLimit returned successfully even though global cleanup never resolved
      expect(result.allowed).toBe(true);
      // 4 prepare calls: stale + per-IP + count + insert
      expect(db.prepare).toHaveBeenCalledTimes(4);

      randomSpy.mockRestore();
    });

    it("errors in global cleanup are caught and logged, not propagated", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const cleanupError = new Error("DB cleanup error");
      const db = mockDbWithCleanupBehavior(Promise.reject(cleanupError));

      const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      // Allow the fire-and-forget rejection to settle through the .catch() handler
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result.allowed).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith("Stale rate limit cleanup failed:", cleanupError);

      randomSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });
});

describe("getEndpointName", () => {
  it("returns 'subscribe' for /api/subscribe", () => {
    expect(getEndpointName("/api/subscribe")).toBe("subscribe");
  });

  it("returns 'verify' for /api/verify", () => {
    expect(getEndpointName("/api/verify")).toBe("verify");
  });

  it("returns 'unsubscribe' for /api/unsubscribe", () => {
    expect(getEndpointName("/api/unsubscribe")).toBe("unsubscribe");
  });

  it("returns 'send' for /api/send", () => {
    expect(getEndpointName("/api/send")).toBe("send");
  });

  it("returns 'admin' for /api/admin/stats", () => {
    expect(getEndpointName("/api/admin/stats")).toBe("admin");
  });

  it("returns 'admin' for /api/admin/subscribers", () => {
    expect(getEndpointName("/api/admin/subscribers")).toBe("admin");
  });

  it("returns 'admin' for any /api/admin/* subpath", () => {
    expect(getEndpointName("/api/admin/anything")).toBe("admin");
  });

  it("returns null for unknown paths", () => {
    expect(getEndpointName("/")).toBeNull();
    expect(getEndpointName("/unknown")).toBeNull();
  });

  it("returns null for /api/unknown", () => {
    expect(getEndpointName("/api/unknown")).toBeNull();
  });

  it("returns null for /api/admin (no trailing slash)", () => {
    expect(getEndpointName("/api/admin")).toBeNull();
  });
});
