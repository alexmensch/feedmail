/**
 * RSS/Atom feed parser module.
 *
 * Parses both Atom and RSS 2.0 feeds into a normalized item format
 * using fast-xml-parser.
 */

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => ["entry", "item", "link"].includes(name),
});

/**
 * @typedef {Object} FeedItem
 * @property {string} id - Unique identifier (guid/id or link fallback)
 * @property {string} title - Item title
 * @property {string} link - URL to the item
 * @property {string|null} date - ISO 8601 date string, or null if unavailable
 * @property {string|null} content - Full HTML content, or null
 * @property {string|null} summary - Brief summary/description, or null
 */

/**
 * Extract a text value from a field that may be a plain string
 * or an object with a `#text` property.
 * @param {string|object|null|undefined} field
 * @returns {string|null}
 */
function textValue(field) {
  if (field == null) return null;
  if (typeof field === "string") return field;
  if (Array.isArray(field)) return textValue(field[0]);
  if (typeof field === "object" && field["#text"] != null) {
    return String(field["#text"]);
  }
  return null;
}

/**
 * Resolve the best link from an Atom entry's `link` field.
 *
 * The field is always an array (due to isArray config) of link objects
 * or strings. Prefers `rel="alternate"`, then any link without a rel,
 * then the first available href.
 * @param {Array} links
 * @returns {string|null}
 */
function resolveAtomLink(links) {
  if (!links || !Array.isArray(links) || links.length === 0) return null;

  // Find rel="alternate"
  for (const link of links) {
    if (typeof link === "string") return link;
    if (link["@_rel"] === "alternate" && link["@_href"]) {
      return link["@_href"];
    }
  }

  // Find link with no rel attribute
  for (const link of links) {
    if (typeof link === "object" && !link["@_rel"] && link["@_href"]) {
      return link["@_href"];
    }
  }

  // Fallback to first href available
  for (const link of links) {
    if (typeof link === "object" && link["@_href"]) {
      return link["@_href"];
    }
  }

  return null;
}

/**
 * Convert a date string to an ISO 8601 string.
 * Returns null if the input is falsy or produces an invalid date.
 * @param {string|null|undefined} dateStr
 * @returns {string|null}
 */
function toISOString(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Parse an Atom feed's entries into normalized items.
 * @param {object} feed - The parsed `feed` root object
 * @returns {FeedItem[]}
 */
function parseAtomEntries(feed) {
  const entries = feed.entry || [];

  return entries.map((entry) => {
    const link = resolveAtomLink(entry.link);

    return {
      id: textValue(entry.id) || link || "",
      title: textValue(entry.title) || "",
      link: link || "",
      date: toISOString(entry.updated) || toISOString(entry.published) || null,
      content: textValue(entry.content) || null,
      summary: textValue(entry.summary) || null,
    };
  });
}

/**
 * Parse RSS 2.0 channel items into normalized items.
 * @param {object} channel - The parsed `rss.channel` object
 * @returns {FeedItem[]}
 */
function parseRssItems(channel) {
  const items = channel.item || [];

  return items.map((item) => {
    const guid = textValue(item.guid);
    const link = textValue(item.link) || "";

    return {
      id: guid || link || "",
      title: textValue(item.title) || "",
      link: link,
      date: toISOString(item.pubDate) || null,
      content: textValue(item["content:encoded"]) || null,
      summary: textValue(item.description) || null,
    };
  });
}

/**
 * Parse an XML string containing an Atom or RSS 2.0 feed into
 * a normalized array of feed items.
 *
 * @param {string} xmlString - Raw XML content of the feed
 * @returns {FeedItem[]} Array of normalized feed items
 * @throws {Error} If the XML cannot be parsed or the feed format is unrecognized
 */
export function parseFeed(xmlString) {
  const parsed = parser.parse(xmlString);

  if (parsed.feed) {
    return parseAtomEntries(parsed.feed);
  }

  if (parsed.rss && parsed.rss.channel) {
    return parseRssItems(parsed.rss.channel);
  }

  throw new Error(
    "Unrecognized feed format: expected Atom <feed> or RSS <rss> root element",
  );
}

/**
 * Fetch a feed URL and parse its contents into normalized items.
 *
 * @param {string} feedUrl - The URL of the RSS or Atom feed
 * @param {string} userAgent - User-Agent header value for the request
 * @returns {Promise<FeedItem[]>} Array of normalized feed items
 * @throws {Error} If the fetch fails, returns a non-OK status, or the feed is unparseable
 */
export async function fetchAndParseFeed(feedUrl, userAgent) {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch feed: ${response.status} ${response.statusText}`,
    );
  }

  const xmlString = await response.text();
  return parseFeed(xmlString);
}
