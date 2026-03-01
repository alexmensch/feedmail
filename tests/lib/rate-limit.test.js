import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RATE_LIMITS,
  checkRateLimit,
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
    const db = mockDb({ count: 0, oldest: null });

    await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    // First prepare call is the cleanup DELETE
    expect(db._stmts.length).toBeGreaterThanOrEqual(2);
    const cleanupStmt = db._stmts[0];
    expect(cleanupStmt.bind).toHaveBeenCalledWith("1.2.3.4", "subscribe", "-3600");
    expect(cleanupStmt.run).toHaveBeenCalled();
  });

  it("inserts new row when request is allowed", async () => {
    const db = mockDb({ count: 0, oldest: null });

    await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    // Third prepare call is the INSERT
    expect(db._stmts.length).toBe(3);
    const insertStmt = db._stmts[2];
    expect(insertStmt.bind).toHaveBeenCalledWith("1.2.3.4", "subscribe");
    expect(insertStmt.run).toHaveBeenCalled();
  });

  it("does NOT insert row when request is denied", async () => {
    const now = new Date();
    const oldest = new Date(now.getTime() - 30 * 60 * 1000);
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ count: 10, oldest: oldestStr });

    await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    // Only 2 prepare calls: cleanup + count (no insert)
    expect(db._stmts.length).toBe(2);
  });

  it("handles null count result gracefully", async () => {
    const db = mockDb(null);

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(true);
  });

  it("passes correct bind parameters for count query", async () => {
    const db = mockDb({ count: 0, oldest: null });

    await checkRateLimit(db, "10.0.0.1", "admin", 30, 7200);

    // Second prepare call is the count SELECT
    const countStmt = db._stmts[1];
    expect(countStmt.bind).toHaveBeenCalledWith("10.0.0.1", "admin", "-7200");
    expect(countStmt.first).toHaveBeenCalled();
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
