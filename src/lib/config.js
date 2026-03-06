/**
 * Configuration helpers for reading channel and site config from D1.
 * Validation functions are reusable by admin write endpoints.
 */

import {
  getAllChannels,
  getChannelFromDb,
  getFeedsByChannelId,
  getSiteConfig,
  getRateLimitConfigByEndpoint,
} from "./db.js";
import { RATE_LIMITS } from "./rate-limit.js";

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate DOMAIN format. Throws on invalid config.
 * @param {string} domain
 */
export function validateDomain(domain) {
  if (!domain) {
    throw new Error("DOMAIN is required but missing or empty");
  }
  if (domain.includes("://")) {
    throw new Error("DOMAIN must not include protocol (e.g., remove 'https://')");
  }
  if (domain.endsWith("/")) {
    throw new Error("DOMAIN must not end with a trailing slash");
  }
  if (domain.includes("/")) {
    throw new Error("DOMAIN must not contain path segments");
  }
}

/**
 * Validate channel fields for create/update.
 * Returns an error message string or null if valid.
 * @param {object} data - Channel data
 * @param {object} [options]
 * @param {boolean} [options.requireFeeds] - Whether feeds are required (true for create)
 * @returns {string|null}
 */
export function validateChannelFields(data, { requireFeeds = false } = {}) {
  const requiredFields = ["siteName", "siteUrl", "fromUser", "fromName", "corsOrigins"];

  for (const field of requiredFields) {
    if (!data[field]) {
      return `Missing required field: ${field}`;
    }
  }

  if (/[@\s]/.test(data.fromUser)) {
    return "fromUser must not contain '@' or whitespace";
  }

  if (!Array.isArray(data.corsOrigins) || data.corsOrigins.length === 0) {
    return "corsOrigins must be a non-empty array";
  }

  if (requireFeeds) {
    if (!Array.isArray(data.feeds) || data.feeds.length === 0) {
      return "At least one feed is required";
    }
    const feedError = validateFeedList(data.feeds);
    if (feedError) return feedError;
  }

  return null;
}

/**
 * Validate a list of feeds for internal uniqueness (used during channel create).
 * @param {Array<{name: string, url: string}>} feeds
 * @returns {string|null}
 */
export function validateFeedList(feeds) {
  const seenUrls = new Set();
  const seenNames = new Set();

  for (let i = 0; i < feeds.length; i++) {
    const feed = feeds[i];

    if (!feed.name || typeof feed.name !== "string") {
      return `Feed at index ${i}: missing or empty name`;
    }
    if (!feed.url || typeof feed.url !== "string") {
      return `Feed at index ${i}: missing or empty url`;
    }

    if (seenUrls.has(feed.url)) {
      return `Duplicate feed URL: ${feed.url}`;
    }
    seenUrls.add(feed.url);

    const lowerName = feed.name.toLowerCase();
    if (seenNames.has(lowerName)) {
      return `Duplicate feed name: ${feed.name} (case-insensitive)`;
    }
    seenNames.add(lowerName);
  }

  return null;
}

// ─── DB-backed config readers ───────────────────────────────────────────────

/**
 * Convert a DB channel row (snake_case) to a JS channel object (camelCase).
 * @param {object} row
 * @param {Array} [feeds]
 * @returns {object}
 */
function formatChannel(row, feeds) {
  const channel = {
    id: row.id,
    siteName: row.site_name,
    siteUrl: row.site_url,
    fromUser: row.from_user,
    fromName: row.from_name,
    replyTo: row.reply_to || undefined,
    companyName: row.company_name || undefined,
    companyAddress: row.company_address || undefined,
    corsOrigins: JSON.parse(row.cors_origins),
  };
  if (feeds !== undefined) {
    channel.feeds = feeds.map((f) => ({ id: f.id, name: f.name, url: f.url }));
  }
  return channel;
}

/**
 * Get all configured channels with their feeds.
 * @param {object} db - D1 database binding
 * @returns {Promise<Array<object>>}
 */
export async function getChannels(db) {
  const rows = await getAllChannels(db);
  const channels = [];
  for (const row of rows) {
    const feeds = await getFeedsByChannelId(db, row.id);
    channels.push(formatChannel(row, feeds));
  }
  return channels;
}

/**
 * Look up a channel by its ID, including feeds.
 * @param {object} db - D1 database binding
 * @param {string} channelId
 * @returns {Promise<object|null>}
 */
export async function getChannelById(db, channelId) {
  const row = await getChannelFromDb(db, channelId);
  if (!row) return null;
  const feeds = await getFeedsByChannelId(db, row.id);
  return formatChannel(row, feeds);
}

/**
 * Get verification rate limit settings from DB, with hardcoded fallbacks.
 * @param {object} db - D1 database binding
 * @returns {Promise<{ maxAttempts: number, windowHours: number }>}
 */
export async function getVerifyLimits(db) {
  const config = await getSiteConfig(db);
  return {
    maxAttempts: config?.verify_max_attempts ?? 3,
    windowHours: config?.verify_window_hours ?? 24,
  };
}

/**
 * Collect all CORS origins from all configured channels.
 * @param {object} db - D1 database binding
 * @returns {Promise<string[]>}
 */
export async function getAllCorsOrigins(db) {
  const rows = await getAllChannels(db);
  const origins = new Set();
  for (const row of rows) {
    const corsOrigins = JSON.parse(row.cors_origins);
    for (const origin of corsOrigins) {
      origins.add(origin);
    }
  }
  return [...origins];
}

/**
 * Get rate limit config for an endpoint from DB, with hardcoded fallback.
 * @param {object} db - D1 database binding
 * @param {string} endpoint
 * @returns {Promise<{ maxRequests: number, windowSeconds: number }>}
 */
export async function getRateLimitConfig(db, endpoint) {
  const row = await getRateLimitConfigByEndpoint(db, endpoint);
  if (row) {
    return { maxRequests: row.max_requests, windowSeconds: row.window_seconds };
  }
  return RATE_LIMITS[endpoint] || { maxRequests: 10, windowSeconds: 3600 };
}
