/**
 * Convert HTML to plain text for email text/plain alternative.
 */

const ENTITY_MAP = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&hellip;": "\u2026",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201C",
  "&rdquo;": "\u201D",
};

/**
 * Strip HTML tags and convert to plain text.
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
export function htmlToText(html) {
  if (!html) return "";

  let text = html;

  // Convert <br> and block-level elements to newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n\n");
  text = text.replace(/<li[^>]*>/gi, "- ");
  text = text.replace(/<hr\s*\/?>/gi, "\n---\n");

  // Extract href from links: <a href="url">text</a> → text (url)
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi,
    "$2 ($1)",
  );

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(
    /&[#a-z0-9]+;/gi,
    (entity) => ENTITY_MAP[entity] || decodeNumericEntity(entity) || entity,
  );

  // Collapse multiple blank lines into two newlines max
  text = text.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  text = text.trim();

  return text;
}

/**
 * Decode numeric HTML entities like &#123; or &#x7B;
 */
function decodeNumericEntity(entity) {
  const match = entity.match(/^&#(x?)(\w+);$/i);
  if (!match) return null;

  const codePoint = match[1]
    ? parseInt(match[2], 16)
    : parseInt(match[2], 10);

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return null;
  }
}
