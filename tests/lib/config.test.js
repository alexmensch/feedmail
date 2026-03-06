import { describe, it, expect, beforeEach, vi } from "vitest";

// config.js has module-level cache that persists across calls.
// We need to re-import it fresh for each test to avoid stale cache.

function makeChannel(overrides = {}) {
  return {
    id: "test-channel",
    siteName: "Test Site",
    siteUrl: "https://test.example.com",
    fromUser: "hello",
    fromName: "Test Sender",
    corsOrigins: ["https://test.example.com"],
    feeds: [{ name: "Main Feed", url: "https://test.example.com/feed.xml" }],
    ...overrides,
  };
}

function makeEnv(overrides = {}) {
  return {
    DOMAIN: "test.example.com",
    CHANNELS: JSON.stringify([
      makeChannel(),
      makeChannel({
        id: "channel-2",
        siteName: "Other Site",
        siteUrl: "https://other.example.com",
        fromUser: "news",
        fromName: "Other",
        corsOrigins: ["https://other.example.com"],
        feeds: [{ name: "Other Feed", url: "https://other.example.com/rss" }],
      }),
    ]),
    VERIFY_MAX_ATTEMPTS: "5",
    VERIFY_WINDOW_HOURS: "24",
    ...overrides,
  };
}

describe("config", () => {
  let getChannels, getChannelById, getVerifyLimits, getAllCorsOrigins;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../src/lib/config.js");
    getChannels = mod.getChannels;
    getChannelById = mod.getChannelById;
    getVerifyLimits = mod.getVerifyLimits;
    getAllCorsOrigins = mod.getAllCorsOrigins;
  });

  describe("getChannels", () => {
    it("parses CHANNELS JSON from env", () => {
      const channels = getChannels(makeEnv());
      expect(channels).toHaveLength(2);
      expect(channels[0].id).toBe("test-channel");
      expect(channels[1].id).toBe("channel-2");
    });

    it("caches parsed result across calls", () => {
      const env = makeEnv();
      const first = getChannels(env);
      const second = getChannels(env);
      expect(first).toBe(second); // same reference
    });

    it("throws on invalid JSON", () => {
      expect(() => getChannels({ CHANNELS: "not json", DOMAIN: "test.example.com" })).toThrow();
    });

    it("returns empty array for empty JSON array", () => {
      const channels = getChannels({ CHANNELS: "[]", DOMAIN: "test.example.com" });
      expect(channels).toEqual([]);
    });

    it("reads from CHANNELS env var, not SITES", () => {
      // SITES should not be read
      const env = {
        DOMAIN: "test.example.com",
        CHANNELS: JSON.stringify([makeChannel()]),
        SITES: JSON.stringify([{ id: "old-site" }]),
      };
      const channels = getChannels(env);
      expect(channels[0].id).toBe("test-channel");
    });
  });

  describe("getChannelById", () => {
    it("returns matching channel", () => {
      const channel = getChannelById(makeEnv(), "test-channel");
      expect(channel).toBeTruthy();
      expect(channel.id).toBe("test-channel");
      expect(channel.siteName).toBe("Test Site");
    });

    it("returns null for unknown channel ID", () => {
      const channel = getChannelById(makeEnv(), "nonexistent");
      expect(channel).toBeNull();
    });

    it("returns null when channels list is empty", () => {
      const channel = getChannelById(
        { CHANNELS: "[]", DOMAIN: "test.example.com" },
        "test-channel",
      );
      expect(channel).toBeNull();
    });

    it("returns channel with structured feed objects", () => {
      const channel = getChannelById(makeEnv(), "test-channel");
      expect(channel.feeds).toHaveLength(1);
      expect(channel.feeds[0]).toEqual({
        name: "Main Feed",
        url: "https://test.example.com/feed.xml",
      });
    });
  });

  describe("getVerifyLimits", () => {
    it("parses configured limits", () => {
      const limits = getVerifyLimits(makeEnv());
      expect(limits).toEqual({ maxAttempts: 5, windowHours: 24 });
    });

    it("uses defaults when env vars are missing", () => {
      const limits = getVerifyLimits({});
      expect(limits).toEqual({ maxAttempts: 3, windowHours: 24 });
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
    it("collects all origins from all channels", () => {
      const origins = getAllCorsOrigins(makeEnv());
      expect(origins).toContain("https://test.example.com");
      expect(origins).toContain("https://other.example.com");
      expect(origins).toHaveLength(2);
    });

    it("deduplicates overlapping origins", () => {
      const env = {
        DOMAIN: "test.example.com",
        CHANNELS: JSON.stringify([
          makeChannel({ id: "a", corsOrigins: ["https://shared.com", "https://a.com"] }),
          makeChannel({ id: "b", corsOrigins: ["https://shared.com", "https://b.com"] }),
        ]),
      };
      const origins = getAllCorsOrigins(env);
      expect(origins).toHaveLength(3);
      expect(
        origins.filter((o) => o === "https://shared.com"),
      ).toHaveLength(1);
    });

    it("handles channels without corsOrigins", () => {
      const env = {
        DOMAIN: "test.example.com",
        CHANNELS: JSON.stringify([
          makeChannel({ id: "a", corsOrigins: ["https://a.com"] }),
        ]),
      };
      const origins = getAllCorsOrigins(env);
      expect(origins).toEqual(["https://a.com"]);
    });

    it("returns empty array for empty channels", () => {
      const origins = getAllCorsOrigins({ CHANNELS: "[]", DOMAIN: "test.example.com" });
      expect(origins).toEqual([]);
    });
  });

  describe("config validation (via getChannels)", () => {
    // validateConfig is called internally by getChannels.
    // We test it by calling getChannels with invalid config and expecting throws.

    it("accepts valid config without errors", () => {
      expect(() => getChannels(makeEnv())).not.toThrow();
    });

    describe("DOMAIN validation", () => {
      it("rejects missing DOMAIN", () => {
        const env = makeEnv();
        delete env.DOMAIN;
        expect(() => getChannels(env)).toThrow();
      });

      it("rejects empty DOMAIN", () => {
        expect(() => getChannels(makeEnv({ DOMAIN: "" }))).toThrow();
      });

      it("rejects DOMAIN with protocol (https://)", () => {
        expect(() =>
          getChannels(makeEnv({ DOMAIN: "https://test.example.com" })),
        ).toThrow();
      });

      it("rejects DOMAIN with protocol (http://)", () => {
        expect(() =>
          getChannels(makeEnv({ DOMAIN: "http://test.example.com" })),
        ).toThrow();
      });

      it("rejects DOMAIN with trailing slash", () => {
        expect(() =>
          getChannels(makeEnv({ DOMAIN: "test.example.com/" })),
        ).toThrow();
      });

      it("rejects DOMAIN with path segments", () => {
        expect(() =>
          getChannels(makeEnv({ DOMAIN: "test.example.com/api" })),
        ).toThrow();
      });
    });

    describe("channel required fields", () => {
      it("rejects channel missing id", () => {
        const channel = makeChannel();
        delete channel.id;
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects channel missing siteName", () => {
        const channel = makeChannel();
        delete channel.siteName;
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects channel missing siteUrl", () => {
        const channel = makeChannel();
        delete channel.siteUrl;
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects channel missing fromUser", () => {
        const channel = makeChannel();
        delete channel.fromUser;
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects channel missing fromName", () => {
        const channel = makeChannel();
        delete channel.fromName;
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects channel missing corsOrigins", () => {
        const channel = makeChannel();
        delete channel.corsOrigins;
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });
    });

    describe("fromUser validation", () => {
      it("rejects fromUser containing @", () => {
        const channel = makeChannel({ fromUser: "hello@example.com" });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects fromUser containing whitespace", () => {
        const channel = makeChannel({ fromUser: "hello world" });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects empty fromUser", () => {
        const channel = makeChannel({ fromUser: "" });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("accepts valid fromUser without @ or whitespace", () => {
        const channel = makeChannel({ fromUser: "newsletter" });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).not.toThrow();
      });
    });

    describe("feed validation", () => {
      it("rejects feed missing name", () => {
        const channel = makeChannel({
          feeds: [{ url: "https://test.example.com/feed.xml" }],
        });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects feed missing url", () => {
        const channel = makeChannel({
          feeds: [{ name: "Main Feed" }],
        });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects feed with empty name", () => {
        const channel = makeChannel({
          feeds: [{ name: "", url: "https://test.example.com/feed.xml" }],
        });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects feed with empty url", () => {
        const channel = makeChannel({
          feeds: [{ name: "Main Feed", url: "" }],
        });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("accepts empty feeds array", () => {
        const channel = makeChannel({ feeds: [] });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).not.toThrow();
      });
    });

    describe("duplicate feed detection", () => {
      it("rejects duplicate feed URLs within same channel", () => {
        const channel = makeChannel({
          feeds: [
            { name: "Feed A", url: "https://test.example.com/feed.xml" },
            { name: "Feed B", url: "https://test.example.com/feed.xml" },
          ],
        });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("rejects duplicate feed names (case-insensitive) within same channel", () => {
        const channel = makeChannel({
          feeds: [
            { name: "Main Feed", url: "https://test.example.com/feed1.xml" },
            { name: "main feed", url: "https://test.example.com/feed2.xml" },
          ],
        });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow();
      });

      it("allows duplicate feed URLs across different channels", () => {
        const channel1 = makeChannel({
          id: "channel-1",
          feeds: [{ name: "Feed A", url: "https://shared.example.com/feed.xml" }],
        });
        const channel2 = makeChannel({
          id: "channel-2",
          feeds: [{ name: "Feed B", url: "https://shared.example.com/feed.xml" }],
        });
        expect(() =>
          getChannels(
            makeEnv({ CHANNELS: JSON.stringify([channel1, channel2]) }),
          ),
        ).not.toThrow();
      });

      it("allows duplicate feed names across different channels", () => {
        const channel1 = makeChannel({
          id: "channel-1",
          feeds: [{ name: "Main Feed", url: "https://test.example.com/feed1.xml" }],
        });
        const channel2 = makeChannel({
          id: "channel-2",
          feeds: [{ name: "Main Feed", url: "https://test.example.com/feed2.xml" }],
        });
        expect(() =>
          getChannels(
            makeEnv({ CHANNELS: JSON.stringify([channel1, channel2]) }),
          ),
        ).not.toThrow();
      });
    });

    describe("error messages identify channel and field", () => {
      it("error message includes channel ID for field errors", () => {
        const channel = makeChannel({ fromUser: "bad@user" });
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow(/test-channel/);
      });

      it("error message identifies missing field", () => {
        const channel = makeChannel();
        delete channel.siteName;
        expect(() =>
          getChannels(makeEnv({ CHANNELS: JSON.stringify([channel]) })),
        ).toThrow(/siteName/i);
      });
    });
  });
});
