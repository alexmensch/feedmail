import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  STALE_ROW_MAX_AGE_SECONDS,
  CLEANUP_PROBABILITY,
  checkRateLimit,
  cleanupStaleRateLimits,
  getEndpointName
} from "../../../src/shared/lib/rate-limit.js";
import { RATE_LIMIT_DEFAULTS } from "../../../src/shared/lib/config.js";

/**
 * Create a mock D1 database that supports multiple prepare() calls and
 * dispatches by SQL. The atomic conditional INSERT reports meta.changes — 1
 * when the request was recorded (allowed), 0 when the in-SQL guard rejected it
 * (denied) — and the retry-after lookup's first() returns the oldest in-window
 * request.
 * @param {{ recorded?: boolean, oldest?: string|null }} opts
 * @returns {{ prepare: Function, _stmts: Array }}
 */
function mockDb({ recorded = true, oldest = null } = {}) {
  const stmts = [];
  const db = {
    prepare: vi.fn().mockImplementation((sql) => {
      const stmt = {
        sql,
        bind: vi.fn().mockReturnThis(),
        run: vi
          .fn()
          .mockResolvedValue(
            sql.includes("INSERT")
              ? { meta: { changes: recorded ? 1 : 0 } }
              : {}
          ),
        first: vi.fn().mockResolvedValue({ oldest })
      };
      stmts.push(stmt);
      return stmt;
    }),
    _stmts: stmts
  };
  return db;
}

/**
 * Create a mock D1 database where the first prepare() call (stale cleanup)
 * uses a custom run() promise; the conditional INSERT records the request
 * (allowed) and all other statements resolve normally.
 * @param {Promise} cleanupRun - Promise returned by the stale cleanup's .run()
 * @returns {{ prepare: Function }}
 */
function mockDbWithCleanupBehavior(cleanupRun) {
  let callCount = 0;
  return {
    prepare: vi.fn().mockImplementation((sql) => {
      const isStaleCleanup = callCount++ === 0;
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockImplementation(() => {
          if (isStaleCleanup) {
            return cleanupRun;
          }
          if (sql.includes("INSERT")) {
            return Promise.resolve({ meta: { changes: 1 } });
          }
          return Promise.resolve({});
        }),
        first: vi.fn().mockResolvedValue({ oldest: null })
      };
    })
  };
}

describe("RATE_LIMIT_DEFAULTS config", () => {
  it("has entries for all five API endpoints", () => {
    expect(RATE_LIMIT_DEFAULTS).toHaveProperty("subscribe");
    expect(RATE_LIMIT_DEFAULTS).toHaveProperty("verify");
    expect(RATE_LIMIT_DEFAULTS).toHaveProperty("unsubscribe");
    expect(RATE_LIMIT_DEFAULTS).toHaveProperty("send");
    expect(RATE_LIMIT_DEFAULTS).toHaveProperty("admin");
  });

  it("has entries for admin auth endpoints", () => {
    expect(RATE_LIMIT_DEFAULTS).toHaveProperty("admin_login");
    expect(RATE_LIMIT_DEFAULTS).toHaveProperty("admin_verify");
  });

  it("admin_login defaults to 10 requests per hour", () => {
    expect(RATE_LIMIT_DEFAULTS.admin_login.maxRequests).toBe(10);
    expect(RATE_LIMIT_DEFAULTS.admin_login.windowHours).toBe(1);
  });

  it("admin_verify defaults to 10 requests per hour", () => {
    expect(RATE_LIMIT_DEFAULTS.admin_verify.maxRequests).toBe(10);
    expect(RATE_LIMIT_DEFAULTS.admin_verify.windowHours).toBe(1);
  });

  it("all entries have positive maxRequests and windowHours", () => {
    for (const [name, config] of Object.entries(RATE_LIMIT_DEFAULTS)) {
      expect(config.maxRequests, `${name}.maxRequests`).toBeGreaterThan(0);
      expect(config.windowHours, `${name}.windowHours`).toBeGreaterThan(0);
      expect(
        Number.isInteger(config.maxRequests),
        `${name}.maxRequests is integer`
      ).toBe(true);
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
      "DELETE FROM rate_limits WHERE requested_at < datetime('now', ? || ' seconds')"
    );
  });

  it("binds with the negative STALE_ROW_MAX_AGE_SECONDS value", async () => {
    const db = mockDb();
    await cleanupStaleRateLimits(db);
    expect(db._stmts[0].bind).toHaveBeenCalledWith(
      `-${STALE_ROW_MAX_AGE_SECONDS}`
    );
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
        first: vi.fn()
      })
    };
    await expect(cleanupStaleRateLimits(db)).rejects.toThrow("DB error");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the request when the atomic insert records it (under the limit)", async () => {
    const db = mockDb({ recorded: true });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it("denies the request when the atomic guard records nothing (at the limit)", async () => {
    const now = new Date();
    const oldest = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ recorded: false, oldest: oldestStr });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("returns retryAfter based on oldest request expiry plus jitter", async () => {
    const now = new Date();
    // Oldest request was 45 minutes ago, window is 1 hour
    // So base retryAfter should be ~900 seconds, plus 0-30s jitter
    const oldest = new Date(now.getTime() - 45 * 60 * 1000);
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ recorded: false, oldest: oldestStr });

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

    const db = mockDb({ recorded: false, oldest: oldestStr });
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

    const db = mockDb({ recorded: false, oldest: oldestStr });
    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    // Base ~900 + jitter floor(0.999 * 31) = 30 → ~930
    expect(result.retryAfter).toBeGreaterThanOrEqual(925);
    expect(result.retryAfter).toBeLessThanOrEqual(935);

    randomSpy.mockRestore();
  });

  it("uses current time as fallback when oldest is null", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    // denied, but no in-window rows remain to read an oldest from
    const db = mockDb({ recorded: false, oldest: null });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    // When oldest is null, falls back to new Date(), so retryAfter should be
    // approximately windowSeconds + jitter
    expect(result.retryAfter).toBeGreaterThanOrEqual(3600);

    randomSpy.mockRestore();
  });

  it("returns retryAfter of at least 1 second", async () => {
    const now = new Date();
    // Oldest request was 59 minutes 59.5 seconds ago, window is 1 hour
    // retryAfter would be ~1 second
    const oldest = new Date(now.getTime() - (3600 * 1000 - 500));
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ recorded: false, oldest: oldestStr });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("cleans up expired rows for the IP before recording", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const db = mockDb({ recorded: true });

    await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    // First prepare call (no global cleanup) is the per-IP cleanup DELETE
    const cleanupStmt = db._stmts[0];
    expect(cleanupStmt.sql).toContain("DELETE FROM rate_limits");
    expect(cleanupStmt.bind).toHaveBeenCalledWith(
      "1.2.3.4",
      "subscribe",
      "-3600"
    );
    expect(cleanupStmt.run).toHaveBeenCalled();

    randomSpy.mockRestore();
  });

  it("records the request via a single atomic conditional insert when allowed", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const db = mockDb({ recorded: true });

    await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    // No global cleanup: per-IP DELETE + conditional INSERT = 2 statements. The
    // INSERT carries the count guard, so there is no separate count SELECT — the
    // check and the record are one statement (the atomicity fix).
    expect(db._stmts.length).toBe(2);
    const insertStmt = db._stmts[1];
    expect(insertStmt.sql).toContain("INSERT INTO rate_limits");
    expect(insertStmt.bind).toHaveBeenCalledWith(
      "1.2.3.4",
      "subscribe",
      "1.2.3.4",
      "subscribe",
      "-3600",
      10
    );
    expect(insertStmt.run).toHaveBeenCalled();

    randomSpy.mockRestore();
  });

  it("records nothing and looks up retry-after when over the limit", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const now = new Date();
    const oldest = new Date(now.getTime() - 30 * 60 * 1000);
    const oldestStr = oldest.toISOString().replace("T", " ").replace("Z", "");

    const db = mockDb({ recorded: false, oldest: oldestStr });

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);
    // per-IP DELETE + conditional INSERT (records 0 rows) + retry-after SELECT
    expect(db._stmts.length).toBe(3);
    expect(db._stmts[1].sql).toContain("INSERT INTO rate_limits");
    expect(db._stmts[2].sql).toContain("MIN(requested_at)");

    randomSpy.mockRestore();
  });

  it("fails closed (denies) when the insert result is malformed", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    // run() returns no meta.changes — a malformed/unexpected D1 result
    const db = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({}),
        first: vi.fn().mockResolvedValue({ oldest: null })
      }))
    };

    const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

    expect(result.allowed).toBe(false);

    randomSpy.mockRestore();
  });

  it("passes correct bind parameters for the conditional insert", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const db = mockDb({ recorded: true });

    await checkRateLimit(db, "10.0.0.1", "admin", 30, 7200);

    // No global cleanup: per-IP DELETE then the conditional INSERT
    const insertStmt = db._stmts[1];
    expect(insertStmt.sql).toContain("INSERT INTO rate_limits");
    expect(insertStmt.bind).toHaveBeenCalledWith(
      "10.0.0.1",
      "admin",
      "10.0.0.1",
      "admin",
      "-7200",
      30
    );
    expect(insertStmt.run).toHaveBeenCalled();

    randomSpy.mockRestore();
  });

  describe("probabilistic stale cleanup", () => {
    it("triggers global stale cleanup when Math.random < CLEANUP_PROBABILITY", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.009);
      const db = mockDb({ recorded: true });

      await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      // Global cleanup triggered: stale DELETE + per-IP DELETE + conditional INSERT
      expect(db._stmts.length).toBe(3);
      // stmt[0] is the stale cleanup — bound with the max age, not an IP
      expect(db._stmts[0].bind).toHaveBeenCalledWith(
        `-${STALE_ROW_MAX_AGE_SECONDS}`
      );

      randomSpy.mockRestore();
    });

    it("triggers when Math.random returns 0 (lower boundary)", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      const db = mockDb({ recorded: true });

      await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      expect(db._stmts.length).toBe(3);

      randomSpy.mockRestore();
    });

    it("does not trigger global cleanup when Math.random >= CLEANUP_PROBABILITY", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
      const db = mockDb({ recorded: true });

      await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      // Without global cleanup: per-IP DELETE + conditional INSERT = 2 stmts
      expect(db._stmts.length).toBe(2);

      randomSpy.mockRestore();
    });

    it("does not trigger when Math.random equals CLEANUP_PROBABILITY (upper boundary)", async () => {
      const randomSpy = vi
        .spyOn(Math, "random")
        .mockReturnValue(CLEANUP_PROBABILITY);
      const db = mockDb({ recorded: true });

      await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      expect(db._stmts.length).toBe(2);

      randomSpy.mockRestore();
    });

    it("global cleanup is fire-and-forget and does not block request handling", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      // Stale cleanup run() never resolves — would hang checkRateLimit if awaited
      const db = mockDbWithCleanupBehavior(new Promise(() => {}));

      const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      // checkRateLimit returned successfully even though global cleanup never resolved
      expect(result.allowed).toBe(true);
      // 3 prepare calls: stale + per-IP DELETE + conditional INSERT
      expect(db.prepare).toHaveBeenCalledTimes(3);

      randomSpy.mockRestore();
    });

    it("errors in global cleanup are caught and logged, not propagated", async () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const cleanupError = new Error("DB cleanup error");
      const db = mockDbWithCleanupBehavior(Promise.reject(cleanupError));

      const result = await checkRateLimit(db, "1.2.3.4", "subscribe", 10, 3600);

      // Allow the fire-and-forget rejection to settle through the .catch() handler
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result.allowed).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Stale rate limit cleanup failed:",
        cleanupError
      );

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

  it("returns 'admin_login' for /admin/login", () => {
    expect(getEndpointName("/admin/login")).toBe("admin_login");
  });

  it("returns 'admin_verify' for /admin/verify", () => {
    expect(getEndpointName("/admin/verify")).toBe("admin_verify");
  });

  it("returns null for /admin/logout (not rate limited)", () => {
    expect(getEndpointName("/admin/logout")).toBeNull();
  });

  it("returns null for /admin (no rate limiting on protected routes)", () => {
    expect(getEndpointName("/admin")).toBeNull();
  });
});
