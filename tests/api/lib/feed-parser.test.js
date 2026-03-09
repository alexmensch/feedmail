import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseFeed,
  fetchAndParseFeed
} from "../../../src/api/lib/feed-parser.js";

// Sample Atom feed
const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Blog</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <id>urn:uuid:1234</id>
    <title>First Post</title>
    <link href="https://example.com/first" rel="alternate"/>
    <updated>2025-01-15T10:00:00Z</updated>
    <published>2025-01-15T09:00:00Z</published>
    <content type="html">&lt;p&gt;Full content here&lt;/p&gt;</content>
    <summary>A short summary</summary>
  </entry>
  <entry>
    <id>urn:uuid:5678</id>
    <title>Second Post</title>
    <link href="https://example.com/second" rel="alternate"/>
    <updated>2025-01-16T10:00:00Z</updated>
    <content type="html">&lt;p&gt;Another post&lt;/p&gt;</content>
  </entry>
</feed>`;

// Sample RSS 2.0 feed
const RSS_FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test Blog</title>
    <link>https://example.com</link>
    <item>
      <guid>https://example.com/first</guid>
      <title>First Post</title>
      <link>https://example.com/first</link>
      <pubDate>Wed, 15 Jan 2025 10:00:00 GMT</pubDate>
      <content:encoded>&lt;p&gt;Full content&lt;/p&gt;</content:encoded>
      <description>A summary</description>
    </item>
    <item>
      <title>No GUID Post</title>
      <link>https://example.com/no-guid</link>
      <pubDate>Thu, 16 Jan 2025 10:00:00 GMT</pubDate>
      <description>Only a description</description>
    </item>
  </channel>
</rss>`;

describe("parseFeed", () => {
  describe("Atom feeds", () => {
    it("parses Atom feed entries", () => {
      const items = parseFeed(ATOM_FEED);
      expect(items).toHaveLength(2);
    });

    it("extracts id, title, and link", () => {
      const items = parseFeed(ATOM_FEED);
      expect(items[0].id).toBe("urn:uuid:1234");
      expect(items[0].title).toBe("First Post");
      expect(items[0].link).toBe("https://example.com/first");
    });

    it("prefers updated date over published", () => {
      const items = parseFeed(ATOM_FEED);
      expect(items[0].date).toBe("2025-01-15T10:00:00.000Z");
    });

    it("extracts content and summary", () => {
      const items = parseFeed(ATOM_FEED);
      expect(items[0].content).toBe("<p>Full content here</p>");
      expect(items[0].summary).toBe("A short summary");
    });

    it("returns null for missing summary", () => {
      const items = parseFeed(ATOM_FEED);
      expect(items[1].summary).toBeNull();
    });

    it("handles empty Atom feed", () => {
      const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`;
      const items = parseFeed(xml);
      expect(items).toEqual([]);
    });

    it("resolves alternate link type", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>1</id>
            <title>Test</title>
            <link href="https://example.com/self" rel="self"/>
            <link href="https://example.com/alt" rel="alternate"/>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].link).toBe("https://example.com/alt");
    });

    it("returns string link directly when link is a plain string", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>1</id>
            <title>Test</title>
            <link>https://example.com/plain-string-link</link>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].link).toBe("https://example.com/plain-string-link");
    });

    it("returns null link when all link objects have non-alternate rel and no href", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>1</id>
            <title>Test</title>
            <link rel="enclosure" type="audio/mpeg"/>
            <link rel="via" type="text/html"/>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].link).toBe("");
    });

    it("falls back to link with no rel attribute", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>1</id>
            <title>Test</title>
            <link href="https://example.com/self" rel="self"/>
            <link href="https://example.com/norel"/>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].link).toBe("https://example.com/norel");
    });

    it("falls back to first href when no alternate or no-rel link", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>1</id>
            <title>Test</title>
            <link href="https://example.com/self" rel="self"/>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].link).toBe("https://example.com/self");
    });

    it("uses link as fallback id when id is missing", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>No ID</title>
            <link href="https://example.com/post"/>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].id).toBe("https://example.com/post");
    });

    it("falls back to empty string for id when no id and no link", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Orphan</title>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].id).toBe("");
    });

    it("falls back to published date when updated is missing", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>1</id>
            <title>Test</title>
            <published>2025-03-01T12:00:00Z</published>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].date).toBe("2025-03-01T12:00:00.000Z");
    });

    it("returns null date when both updated and published are missing", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>1</id>
            <title>Test</title>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].date).toBeNull();
    });

    it("returns null date for invalid date strings", () => {
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>1</id>
            <title>Test</title>
            <updated>not-a-date</updated>
          </entry>
        </feed>`;
      const items = parseFeed(xml);
      expect(items[0].date).toBeNull();
    });
  });

  describe("RSS feeds", () => {
    it("parses RSS feed items", () => {
      const items = parseFeed(RSS_FEED);
      expect(items).toHaveLength(2);
    });

    it("extracts guid as id", () => {
      const items = parseFeed(RSS_FEED);
      expect(items[0].id).toBe("https://example.com/first");
    });

    it("falls back to link when guid is missing", () => {
      const items = parseFeed(RSS_FEED);
      expect(items[1].id).toBe("https://example.com/no-guid");
    });

    it("extracts title and link", () => {
      const items = parseFeed(RSS_FEED);
      expect(items[0].title).toBe("First Post");
      expect(items[0].link).toBe("https://example.com/first");
    });

    it("parses pubDate to ISO string", () => {
      const items = parseFeed(RSS_FEED);
      expect(items[0].date).toBe("2025-01-15T10:00:00.000Z");
    });

    it("extracts content:encoded as content", () => {
      const items = parseFeed(RSS_FEED);
      expect(items[0].content).toBe("<p>Full content</p>");
    });

    it("extracts description as summary", () => {
      const items = parseFeed(RSS_FEED);
      expect(items[0].summary).toBe("A summary");
    });

    it("returns null content when content:encoded is missing", () => {
      const items = parseFeed(RSS_FEED);
      expect(items[1].content).toBeNull();
    });

    it("handles empty RSS channel", () => {
      const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
      const items = parseFeed(xml);
      expect(items).toEqual([]);
    });

    it("handles RSS item with guid as object with #text", () => {
      const xml = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <guid isPermaLink="false">custom-id-123</guid>
              <title>Test</title>
              <link>https://example.com/test</link>
            </item>
          </channel>
        </rss>`;
      const items = parseFeed(xml);
      expect(items[0].id).toBe("custom-id-123");
    });
  });

  describe("unrecognized formats", () => {
    it("throws for unrecognized feed format", () => {
      expect(() => parseFeed("<html><body>Not a feed</body></html>")).toThrow(
        "Unrecognized feed format"
      );
    });

    it("throws for empty XML", () => {
      expect(() => parseFeed("")).toThrow();
    });
  });
});

describe("fetchAndParseFeed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and parses a feed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_FEED)
      })
    );

    const items = await fetchAndParseFeed(
      "https://example.com/feed",
      "feedmail/test"
    );

    expect(items).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith("https://example.com/feed", {
      headers: { "User-Agent": "feedmail/test" }
    });
  });

  it("throws on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found"
      })
    );

    await expect(
      fetchAndParseFeed("https://example.com/feed", "feedmail/test")
    ).rejects.toThrow("Failed to fetch feed: 404 Not Found");
  });

  it("throws on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    await expect(
      fetchAndParseFeed("https://example.com/feed", "feedmail/test")
    ).rejects.toThrow("Network error");
  });
});
