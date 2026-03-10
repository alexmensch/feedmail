import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/shared/lib/db.js", () => ({
  getAllChannels: vi.fn(),
  getChannelById: vi.fn(),
  getFeedsByChannelId: vi.fn(),
  getSiteConfig: vi.fn(),
  getRateLimitConfigs: vi.fn()
}));

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

describe("validateChannelId", () => {
  let validateChannelId;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../../src/shared/lib/config.js");
    validateChannelId = mod.validateChannelId;
  });

  describe("valid slugs", () => {
    it("accepts a simple lowercase word", () => {
      expect(() => validateChannelId("newsletter")).not.toThrow();
    });

    it("accepts a hyphenated slug", () => {
      expect(() => validateChannelId("my-blog")).not.toThrow();
    });

    it("accepts a slug with numbers", () => {
      expect(() => validateChannelId("updates-2024")).not.toThrow();
    });

    it("accepts a single character", () => {
      expect(() => validateChannelId("a")).not.toThrow();
    });

    it("accepts a single digit", () => {
      expect(() => validateChannelId("1")).not.toThrow();
    });

    it("accepts multiple hyphen-separated segments", () => {
      expect(() => validateChannelId("my-cool-blog-2024")).not.toThrow();
    });
  });

  describe("invalid slugs with specific error messages", () => {
    it("rejects uppercase letters with descriptive error", () => {
      expect(() => validateChannelId("MyBlog")).toThrow(/lowercase/i);
    });

    it("rejects mixed case with descriptive error", () => {
      expect(() => validateChannelId("myBlog")).toThrow(/lowercase/i);
    });

    it("rejects spaces with descriptive error", () => {
      expect(() => validateChannelId("my blog")).toThrow(/space/i);
    });

    it("rejects leading hyphen", () => {
      expect(() => validateChannelId("-blog")).toThrow();
    });

    it("rejects trailing hyphen", () => {
      expect(() => validateChannelId("blog-")).toThrow();
    });

    it("rejects consecutive hyphens with descriptive error", () => {
      expect(() => validateChannelId("my--blog")).toThrow(/consecutive/i);
    });

    it("rejects special characters with descriptive error", () => {
      expect(() => validateChannelId("my_blog")).toThrow();
    });

    it("rejects dots", () => {
      expect(() => validateChannelId("my.blog")).toThrow();
    });

    it("rejects at sign", () => {
      expect(() => validateChannelId("my@blog")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => validateChannelId("")).toThrow();
    });

    it("rejects undefined", () => {
      expect(() => validateChannelId(undefined)).toThrow();
    });

    it("rejects null", () => {
      expect(() => validateChannelId(null)).toThrow();
    });
  });
});

describe("validateChannelFields with channel ID validation", () => {
  let validateChannelFields;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../../src/shared/lib/config.js");
    validateChannelFields = mod.validateChannelFields;
  });

  it("rejects channel with invalid ID format (uppercase)", () => {
    expect(() =>
      validateChannelFields(makeChannel({ id: "MyBlog" }))
    ).toThrow();
  });

  it("rejects channel with invalid ID format (spaces)", () => {
    expect(() =>
      validateChannelFields(makeChannel({ id: "my blog" }))
    ).toThrow();
  });

  it("rejects channel with invalid ID format (leading hyphen)", () => {
    expect(() => validateChannelFields(makeChannel({ id: "-blog" }))).toThrow();
  });

  it("rejects channel with invalid ID format (trailing hyphen)", () => {
    expect(() => validateChannelFields(makeChannel({ id: "blog-" }))).toThrow();
  });

  it("rejects channel with invalid ID format (consecutive hyphens)", () => {
    expect(() =>
      validateChannelFields(makeChannel({ id: "my--blog" }))
    ).toThrow();
  });

  it("rejects channel with invalid ID format (special characters)", () => {
    expect(() =>
      validateChannelFields(makeChannel({ id: "my_blog!" }))
    ).toThrow();
  });

  it("accepts channel with valid slug ID", () => {
    expect(() =>
      validateChannelFields(makeChannel({ id: "my-blog" }))
    ).not.toThrow();
  });

  it("provides descriptive error for invalid channel ID", () => {
    expect(() =>
      validateChannelFields(makeChannel({ id: "My Blog!" }))
    ).toThrow();
  });
});

describe("validateChannelFields with requireFeeds option", () => {
  let validateChannelFields;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../../src/shared/lib/config.js");
    validateChannelFields = mod.validateChannelFields;
  });

  it("throws when requireFeeds is true and no feeds provided", () => {
    expect(() =>
      validateChannelFields(makeChannel(), { requireFeeds: true })
    ).toThrow(/feed/i);
  });

  it("throws when requireFeeds is true and feeds array is empty", () => {
    expect(() =>
      validateChannelFields(makeChannel({ feeds: [] }), { requireFeeds: true })
    ).toThrow(/feed/i);
  });

  it("accepts when requireFeeds is true and feeds are provided", () => {
    expect(() =>
      validateChannelFields(
        makeChannel({
          feeds: [{ name: "Test", url: "https://example.com/feed.xml" }]
        }),
        { requireFeeds: true }
      )
    ).not.toThrow();
  });

  it("does not require feeds when requireFeeds is false (default)", () => {
    expect(() => validateChannelFields(makeChannel())).not.toThrow();
  });
});
