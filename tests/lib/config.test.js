import { describe, it, expect, beforeEach, vi } from "vitest";

// The config module will be refactored to read from D1 instead of env vars.
// All config functions become async. We mock the DB helpers.

vi.mock("../../src/lib/db.js", () => ({
  getAllChannels: vi.fn(),
  getChannelById: vi.fn(),
  getFeedsByChannelId: vi.fn(),
  getSiteConfig: vi.fn(),
  getRateLimitConfigs: vi.fn()
}));

import {
  getAllChannels,
  getChannelById as dbGetChannelById,
  getFeedsByChannelId,
  getSiteConfig,
  getRateLimitConfigs
} from "../../src/lib/db.js";

function makeChannel(overrides = {}) {
  return {
    id: "test-channel",
    siteName: "Test Site",
    siteUrl: "https://test.example.com",
    fromUser: "hello",
    fromName: "Test Sender",
    corsOrigins: ["https://test.example.com"],
    ...overrides
  };
}

function makeFeed(overrides = {}) {
  return {
    id: 1,
    name: "Main Feed",
    url: "https://test.example.com/feed.xml",
    ...overrides
  };
}

function makeEnv(overrides = {}) {
  return {
    DOMAIN: "test.example.com",
    DB: {},
    ...overrides
  };
}

describe("config (async DB-backed)", () => {
  let getChannels,
    getChannelById,
    getVerifyLimits,
    getAllCorsOrigins,
    getRateLimitConfig;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../src/lib/config.js");
    getChannels = mod.getChannels;
    getChannelById = mod.getChannelById;
    getVerifyLimits = mod.getVerifyLimits;
    getAllCorsOrigins = mod.getAllCorsOrigins;
    getRateLimitConfig = mod.getRateLimitConfig;
  });

  describe("getChannels", () => {
    it("reads channels from the database", async () => {
      const channels = [makeChannel(), makeChannel({ id: "channel-2" })];
      getAllChannels.mockResolvedValue(channels);

      const result = await getChannels(makeEnv());

      expect(getAllChannels).toHaveBeenCalledWith(makeEnv().DB);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("test-channel");
      expect(result[1].id).toBe("channel-2");
    });

    it("returns empty array when no channels exist in DB", async () => {
      getAllChannels.mockResolvedValue([]);

      const result = await getChannels(makeEnv());

      expect(result).toEqual([]);
    });

    it("does not read from CHANNELS env var", async () => {
      getAllChannels.mockResolvedValue([makeChannel()]);

      const env = makeEnv({
        CHANNELS: JSON.stringify([{ id: "old-env-channel" }])
      });
      const result = await getChannels(env);

      // Should read from DB, not env
      expect(getAllChannels).toHaveBeenCalled();
      expect(result[0].id).toBe("test-channel");
    });
  });

  describe("getChannelById", () => {
    it("returns matching channel from the database", async () => {
      dbGetChannelById.mockResolvedValue(makeChannel());

      const channel = await getChannelById(makeEnv(), "test-channel");

      expect(dbGetChannelById).toHaveBeenCalledWith(
        makeEnv().DB,
        "test-channel"
      );
      expect(channel).toBeTruthy();
      expect(channel.id).toBe("test-channel");
      expect(channel.siteName).toBe("Test Site");
    });

    it("returns null for unknown channel ID", async () => {
      dbGetChannelById.mockResolvedValue(null);

      const channel = await getChannelById(makeEnv(), "nonexistent");

      expect(channel).toBeNull();
    });

    it("returns channel with feeds included", async () => {
      const channel = makeChannel();
      const feeds = [makeFeed()];
      dbGetChannelById.mockResolvedValue(channel);
      getFeedsByChannelId.mockResolvedValue(feeds);

      const result = await getChannelById(makeEnv(), "test-channel");

      expect(result).toBeTruthy();
      // Channel should include feeds
      expect(result.feeds).toBeDefined();
      expect(result.feeds).toHaveLength(1);
      expect(result.feeds[0].name).toBe("Main Feed");
    });

    it("returns channel with empty feeds array when no feeds exist", async () => {
      dbGetChannelById.mockResolvedValue(makeChannel());
      getFeedsByChannelId.mockResolvedValue([]);

      const result = await getChannelById(makeEnv(), "test-channel");

      expect(result.feeds).toEqual([]);
    });
  });

  describe("getVerifyLimits", () => {
    it("reads verify limits from the database", async () => {
      getSiteConfig.mockResolvedValue({
        verifyMaxAttempts: 5,
        verifyWindowHours: 48
      });

      const limits = await getVerifyLimits(makeEnv());

      expect(getSiteConfig).toHaveBeenCalledWith(makeEnv().DB);
      expect(limits).toEqual({ maxAttempts: 5, windowHours: 48 });
    });

    it("uses hardcoded defaults when site_config table is empty", async () => {
      getSiteConfig.mockResolvedValue(null);

      const limits = await getVerifyLimits(makeEnv());

      expect(limits).toEqual({ maxAttempts: 3, windowHours: 24 });
    });

    it("does not read from VERIFY_MAX_ATTEMPTS env var", async () => {
      getSiteConfig.mockResolvedValue(null);

      const env = makeEnv({
        VERIFY_MAX_ATTEMPTS: "10",
        VERIFY_WINDOW_HOURS: "72"
      });
      const limits = await getVerifyLimits(env);

      // Should use DB defaults, not env vars
      expect(limits).toEqual({ maxAttempts: 3, windowHours: 24 });
    });

    it("returns partial defaults when only some settings exist in DB", async () => {
      getSiteConfig.mockResolvedValue({
        verifyMaxAttempts: 10,
        verifyWindowHours: null
      });

      const limits = await getVerifyLimits(makeEnv());

      expect(limits.maxAttempts).toBe(10);
      // windowHours should fall back to default
      expect(limits.windowHours).toBe(24);
    });
  });

  describe("getAllCorsOrigins", () => {
    it("collects all origins from all channels in the database", async () => {
      getAllChannels.mockResolvedValue([
        makeChannel({ corsOrigins: ["https://test.example.com"] }),
        makeChannel({
          id: "channel-2",
          corsOrigins: ["https://other.example.com"]
        })
      ]);

      const origins = await getAllCorsOrigins(makeEnv());

      expect(origins).toContain("https://test.example.com");
      expect(origins).toContain("https://other.example.com");
      expect(origins).toHaveLength(2);
    });

    it("deduplicates overlapping origins", async () => {
      getAllChannels.mockResolvedValue([
        makeChannel({
          id: "a",
          corsOrigins: ["https://shared.com", "https://a.com"]
        }),
        makeChannel({
          id: "b",
          corsOrigins: ["https://shared.com", "https://b.com"]
        })
      ]);

      const origins = await getAllCorsOrigins(makeEnv());

      expect(origins).toHaveLength(3);
      expect(origins.filter((o) => o === "https://shared.com")).toHaveLength(1);
    });

    it("returns empty array when no channels exist", async () => {
      getAllChannels.mockResolvedValue([]);

      const origins = await getAllCorsOrigins(makeEnv());

      expect(origins).toEqual([]);
    });

    it("handles channels without corsOrigins gracefully", async () => {
      getAllChannels.mockResolvedValue([
        makeChannel({ corsOrigins: ["https://a.com"] }),
        makeChannel({ id: "b", corsOrigins: undefined })
      ]);

      const origins = await getAllCorsOrigins(makeEnv());

      expect(origins).toEqual(["https://a.com"]);
    });
  });

  describe("getRateLimitConfig", () => {
    it("reads rate limit config from the database", async () => {
      getRateLimitConfigs.mockResolvedValue({
        subscribe: { windowHours: 1, maxRequests: 10 },
        verify: { windowHours: 1, maxRequests: 20 },
        unsubscribe: { windowHours: 1, maxRequests: 20 },
        send: { windowHours: 1, maxRequests: 5 },
        admin: { windowHours: 1, maxRequests: 30 }
      });

      const config = await getRateLimitConfig(makeEnv());

      expect(getRateLimitConfigs).toHaveBeenCalledWith(makeEnv().DB);
      expect(config).toHaveProperty("subscribe");
      expect(config).toHaveProperty("verify");
      expect(config).toHaveProperty("unsubscribe");
      expect(config).toHaveProperty("send");
      expect(config).toHaveProperty("admin");
    });

    it("returns hardcoded defaults when rate_limit_config table is empty", async () => {
      getRateLimitConfigs.mockResolvedValue({});

      const config = await getRateLimitConfig(makeEnv());

      // All five endpoints should have defaults
      expect(config.subscribe).toBeDefined();
      expect(config.verify).toBeDefined();
      expect(config.unsubscribe).toBeDefined();
      expect(config.send).toBeDefined();
      expect(config.admin).toBeDefined();
      expect(config.subscribe.maxRequests).toBeGreaterThan(0);
      expect(config.subscribe.windowHours).toBeGreaterThan(0);
    });

    it("falls back to hardcoded default for missing endpoint row", async () => {
      // Only subscribe exists in DB, rest should default
      getRateLimitConfigs.mockResolvedValue({
        subscribe: { windowHours: 2, maxRequests: 50 }
      });

      const config = await getRateLimitConfig(makeEnv());

      expect(config.subscribe.maxRequests).toBe(50);
      expect(config.subscribe.windowHours).toBe(2);
      // Other endpoints should fall back to defaults
      expect(config.verify.maxRequests).toBeGreaterThan(0);
      expect(config.admin.maxRequests).toBeGreaterThan(0);
    });

    it("converts windowHours to windowSeconds for rate-limit.js compatibility", async () => {
      getRateLimitConfigs.mockResolvedValue({
        subscribe: { windowHours: 2, maxRequests: 10 }
      });

      const config = await getRateLimitConfig(makeEnv());

      // The rate-limit.js module expects windowSeconds
      expect(config.subscribe).toHaveProperty("windowSeconds");
      expect(config.subscribe.windowSeconds).toBe(7200); // 2 hours * 3600
    });
  });

  describe("DOMAIN validation", () => {
    // DOMAIN remains in env vars. Validation should still work.
    it("rejects missing DOMAIN", async () => {
      getAllChannels.mockResolvedValue([makeChannel()]);
      const env = makeEnv();
      delete env.DOMAIN;

      await expect(getChannels(env)).rejects.toThrow();
    });

    it("rejects empty DOMAIN", async () => {
      getAllChannels.mockResolvedValue([makeChannel()]);

      await expect(getChannels(makeEnv({ DOMAIN: "" }))).rejects.toThrow();
    });

    it("rejects DOMAIN with protocol (https://)", async () => {
      getAllChannels.mockResolvedValue([makeChannel()]);

      await expect(
        getChannels(makeEnv({ DOMAIN: "https://test.example.com" }))
      ).rejects.toThrow();
    });

    it("rejects DOMAIN with protocol (http://)", async () => {
      getAllChannels.mockResolvedValue([makeChannel()]);

      await expect(
        getChannels(makeEnv({ DOMAIN: "http://test.example.com" }))
      ).rejects.toThrow();
    });

    it("rejects DOMAIN with trailing slash", async () => {
      getAllChannels.mockResolvedValue([makeChannel()]);

      await expect(
        getChannels(makeEnv({ DOMAIN: "test.example.com/" }))
      ).rejects.toThrow();
    });

    it("rejects DOMAIN with path segments", async () => {
      getAllChannels.mockResolvedValue([makeChannel()]);

      await expect(
        getChannels(makeEnv({ DOMAIN: "test.example.com/api" }))
      ).rejects.toThrow();
    });
  });

  describe("config validation at write time (write-time validation functions)", () => {
    // These test the validation functions that will be used by the management API
    // to validate config before persisting. Import them from config.js.

    let validateChannelFields, validateFeedFields;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import("../../src/lib/config.js");
      validateChannelFields = mod.validateChannelFields;
      validateFeedFields = mod.validateFeedFields;
    });

    describe("validateChannelFields", () => {
      it("accepts valid channel fields", () => {
        expect(() => validateChannelFields(makeChannel())).not.toThrow();
      });

      it("rejects channel missing id", () => {
        const ch = makeChannel();
        delete ch.id;
        expect(() => validateChannelFields(ch)).toThrow();
      });

      it("rejects channel missing siteName", () => {
        const ch = makeChannel();
        delete ch.siteName;
        expect(() => validateChannelFields(ch)).toThrow();
      });

      it("rejects channel missing siteUrl", () => {
        const ch = makeChannel();
        delete ch.siteUrl;
        expect(() => validateChannelFields(ch)).toThrow();
      });

      it("rejects channel missing fromUser", () => {
        const ch = makeChannel();
        delete ch.fromUser;
        expect(() => validateChannelFields(ch)).toThrow();
      });

      it("rejects channel missing fromName", () => {
        const ch = makeChannel();
        delete ch.fromName;
        expect(() => validateChannelFields(ch)).toThrow();
      });

      it("rejects channel missing corsOrigins", () => {
        const ch = makeChannel();
        delete ch.corsOrigins;
        expect(() => validateChannelFields(ch)).toThrow();
      });

      it("rejects fromUser containing @", () => {
        expect(() =>
          validateChannelFields(makeChannel({ fromUser: "hello@example.com" }))
        ).toThrow();
      });

      it("rejects fromUser containing whitespace", () => {
        expect(() =>
          validateChannelFields(makeChannel({ fromUser: "hello world" }))
        ).toThrow();
      });

      it("rejects empty fromUser", () => {
        expect(() =>
          validateChannelFields(makeChannel({ fromUser: "" }))
        ).toThrow();
      });

      it("accepts valid fromUser without @ or whitespace", () => {
        expect(() =>
          validateChannelFields(makeChannel({ fromUser: "newsletter" }))
        ).not.toThrow();
      });
    });

    describe("validateFeedFields", () => {
      it("accepts valid feed fields", () => {
        expect(() =>
          validateFeedFields({
            name: "Feed",
            url: "https://example.com/feed.xml"
          })
        ).not.toThrow();
      });

      it("rejects feed missing name", () => {
        expect(() =>
          validateFeedFields({ url: "https://example.com/feed.xml" })
        ).toThrow();
      });

      it("rejects feed missing url", () => {
        expect(() => validateFeedFields({ name: "Feed" })).toThrow();
      });

      it("rejects feed with empty name", () => {
        expect(() =>
          validateFeedFields({ name: "", url: "https://example.com/feed.xml" })
        ).toThrow();
      });

      it("rejects feed with empty url", () => {
        expect(() => validateFeedFields({ name: "Feed", url: "" })).toThrow();
      });
    });
  });
});
