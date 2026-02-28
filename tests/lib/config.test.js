import { describe, it, expect, beforeEach, vi } from "vitest";

// config.js has module-level sitesCache that persists across calls.
// We need to re-import it fresh for each test to avoid stale cache.
// We'll use vi.resetModules() and dynamic import.

function makeEnv(overrides = {}) {
  return {
    SITES: JSON.stringify([
      {
        id: "site-1",
        url: "https://example.com",
        name: "Example",
        fromEmail: "hello@example.com",
        fromName: "Example",
        corsOrigins: ["https://example.com", "https://www.example.com"],
        feeds: ["https://example.com/feed.xml"],
      },
      {
        id: "site-2",
        url: "https://other.com",
        name: "Other",
        fromEmail: "hello@other.com",
        fromName: "Other",
        corsOrigins: ["https://other.com"],
        feeds: ["https://other.com/rss"],
      },
    ]),
    VERIFY_MAX_ATTEMPTS: "5",
    VERIFY_WINDOW_HOURS: "24",
    ...overrides,
  };
}

describe("config", () => {
  let getSites, getSiteById, getVerifyLimits, getAllCorsOrigins;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../src/lib/config.js");
    getSites = mod.getSites;
    getSiteById = mod.getSiteById;
    getVerifyLimits = mod.getVerifyLimits;
    getAllCorsOrigins = mod.getAllCorsOrigins;
  });

  describe("getSites", () => {
    it("parses SITES JSON from env", () => {
      const sites = getSites(makeEnv());
      expect(sites).toHaveLength(2);
      expect(sites[0].id).toBe("site-1");
      expect(sites[1].id).toBe("site-2");
    });

    it("caches parsed result across calls", () => {
      const env = makeEnv();
      const first = getSites(env);
      const second = getSites(env);
      expect(first).toBe(second); // same reference
    });

    it("throws on invalid JSON", () => {
      expect(() => getSites({ SITES: "not json" })).toThrow();
    });

    it("returns empty array for empty JSON array", () => {
      const sites = getSites({ SITES: "[]" });
      expect(sites).toEqual([]);
    });
  });

  describe("getSiteById", () => {
    it("returns matching site", () => {
      const site = getSiteById(makeEnv(), "site-1");
      expect(site).toBeTruthy();
      expect(site.id).toBe("site-1");
      expect(site.name).toBe("Example");
    });

    it("returns null for unknown site ID", () => {
      const site = getSiteById(makeEnv(), "nonexistent");
      expect(site).toBeNull();
    });

    it("returns null when sites list is empty", () => {
      const site = getSiteById({ SITES: "[]" }, "site-1");
      expect(site).toBeNull();
    });
  });

  describe("getVerifyLimits", () => {
    it("parses configured limits", () => {
      const limits = getVerifyLimits(makeEnv());
      expect(limits).toEqual({ maxAttempts: 5, windowHours: 24 });
    });

    it("uses defaults when env vars are missing", () => {
      const limits = getVerifyLimits({});
      expect(limits).toEqual({ maxAttempts: 5, windowHours: 24 });
    });

    it("parses custom values", () => {
      const limits = getVerifyLimits(
        makeEnv({ VERIFY_MAX_ATTEMPTS: "10", VERIFY_WINDOW_HOURS: "48" }),
      );
      expect(limits).toEqual({ maxAttempts: 10, windowHours: 48 });
    });

    it("returns NaN for non-numeric strings", () => {
      const limits = getVerifyLimits(
        makeEnv({ VERIFY_MAX_ATTEMPTS: "abc", VERIFY_WINDOW_HOURS: "xyz" }),
      );
      expect(limits.maxAttempts).toBeNaN();
      expect(limits.windowHours).toBeNaN();
    });
  });

  describe("getAllCorsOrigins", () => {
    it("collects all origins from all sites", () => {
      const origins = getAllCorsOrigins(makeEnv());
      expect(origins).toContain("https://example.com");
      expect(origins).toContain("https://www.example.com");
      expect(origins).toContain("https://other.com");
      expect(origins).toHaveLength(3);
    });

    it("deduplicates overlapping origins", () => {
      const env = {
        SITES: JSON.stringify([
          { id: "a", corsOrigins: ["https://shared.com", "https://a.com"] },
          { id: "b", corsOrigins: ["https://shared.com", "https://b.com"] },
        ]),
      };
      const origins = getAllCorsOrigins(env);
      expect(origins).toHaveLength(3);
      expect(
        origins.filter((o) => o === "https://shared.com"),
      ).toHaveLength(1);
    });

    it("handles sites without corsOrigins", () => {
      const env = {
        SITES: JSON.stringify([
          { id: "a", corsOrigins: ["https://a.com"] },
          { id: "b" }, // no corsOrigins
        ]),
      };
      const origins = getAllCorsOrigins(env);
      expect(origins).toEqual(["https://a.com"]);
    });

    it("returns empty array when no sites have corsOrigins", () => {
      const env = { SITES: JSON.stringify([{ id: "a" }, { id: "b" }]) };
      const origins = getAllCorsOrigins(env);
      expect(origins).toEqual([]);
    });

    it("returns empty array for empty sites", () => {
      const origins = getAllCorsOrigins({ SITES: "[]" });
      expect(origins).toEqual([]);
    });
  });
});
