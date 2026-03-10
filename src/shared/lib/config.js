/**
 * Configuration helpers for reading channel and site config from D1.
 * Validation functions are reusable by admin write endpoints.
 */

import {
  getAllChannels as dbGetAllChannels,
  getChannelById as dbGetChannelById,
  getFeedsByChannelId,
  getSiteConfig,
  getRateLimitConfigs
} from "./db.js";

export const RATE_LIMIT_DEFAULTS = {
  subscribe: { windowHours: 1, maxRequests: 10 },
  verify: { windowHours: 1, maxRequests: 20 },
  unsubscribe: { windowHours: 1, maxRequests: 20 },
  send: { windowHours: 1, maxRequests: 5 },
  admin: { windowHours: 1, maxRequests: 30 },
  admin_login: { windowHours: 1, maxRequests: 10 },
  admin_verify: { windowHours: 1, maxRequests: 10 }
};

// ─── Validation ─────────────────────────────────────────────────────────────

const CHANNEL_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Validate a channel ID slug. Throws a descriptive error on invalid format.
 * @param {string} id
 */
export function validateChannelId(id) {
  if (!id || typeof id !== "string") {
    throw new Error("Missing required field: id");
  }
  if (/[A-Z]/.test(id)) {
    throw new Error("Channel ID must be lowercase");
  }
  if (/\s/.test(id)) {
    throw new Error("Channel ID must not contain spaces");
  }
  if (id.startsWith("-") || id.endsWith("-")) {
    throw new Error("Channel ID must not start or end with a hyphen");
  }
  if (/--/.test(id)) {
    throw new Error("Channel ID must not contain consecutive hyphens");
  }
  if (!CHANNEL_ID_PATTERN.test(id)) {
    throw new Error(
      "Channel ID may only contain lowercase letters, numbers, and hyphens"
    );
  }
}

/**
 * Validate DOMAIN format. Throws on invalid config.
 * @param {string} domain
 */
export function validateDomain(domain) {
  if (!domain) {
    throw new Error("DOMAIN is required but missing or empty");
  }
  if (domain.includes("://")) {
    throw new Error(
      "DOMAIN must not include protocol (e.g., remove 'https://')"
    );
  }
  if (domain.endsWith("/")) {
    throw new Error("DOMAIN must not end with a trailing slash");
  }
  if (domain.includes("/")) {
    throw new Error("DOMAIN must not contain path segments");
  }
}

/**
 * Validate channel fields for create/update. Throws on invalid data.
 * @param {object} data - Channel data
 * @param {object} [options]
 * @param {boolean} [options.requireFeeds] - Whether feeds are required (true for create)
 */
export function validateChannelFields(data, { requireFeeds = false } = {}) {
  const requiredFields = [
    "id",
    "siteName",
    "siteUrl",
    "fromUser",
    "fromName",
    "corsOrigins"
  ];

  for (const field of requiredFields) {
    if (!data[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate channel ID slug format
  validateChannelId(data.id);

  if (/[@\s]/.test(data.fromUser)) {
    throw new Error("fromUser must not contain '@' or whitespace");
  }

  if (!Array.isArray(data.corsOrigins) || data.corsOrigins.length === 0) {
    throw new Error("corsOrigins must be a non-empty array");
  }

  if (requireFeeds) {
    if (!Array.isArray(data.feeds) || data.feeds.length === 0) {
      throw new Error("At least one feed is required");
    }
  }

  // Validate feeds when provided, regardless of requireFeeds
  if (Array.isArray(data.feeds) && data.feeds.length > 0) {
    for (const feed of data.feeds) {
      validateFeedFields(feed);
    }
    // Check for duplicate URLs (exact match)
    const seenUrls = new Set();
    const seenNames = new Set();
    for (const feed of data.feeds) {
      if (seenUrls.has(feed.url)) {
        throw new Error(`Duplicate feed URL: ${feed.url}`);
      }
      seenUrls.add(feed.url);

      const lowerName = feed.name.toLowerCase();
      if (seenNames.has(lowerName)) {
        throw new Error(`Duplicate feed name: ${feed.name} (case-insensitive)`);
      }
      seenNames.add(lowerName);
    }
  }
}

/**
 * Validate a single feed object. Throws on invalid data.
 * @param {object} feed - { name, url }
 */
export function validateFeedFields(feed) {
  if (!feed.name || typeof feed.name !== "string") {
    throw new Error("Feed name is required");
  }
  if (!feed.url || typeof feed.url !== "string") {
    throw new Error("Feed url is required");
  }
}

// ─── DB-backed config readers ───────────────────────────────────────────────

/**
 * Get all configured channels with their feeds.
 * @param {object} env - Worker environment bindings
 * @returns {Promise<Array<object>>}
 */
export async function getChannels(env) {
  validateDomain(env.DOMAIN);
  const channels = await dbGetAllChannels(env.DB);
  for (const channel of channels) {
    const feeds = (await getFeedsByChannelId(env.DB, channel.id)) || [];
    channel.feeds = feeds.map((f) => ({ id: f.id, name: f.name, url: f.url }));
  }
  return channels;
}

/**
 * Look up a channel by its ID, including feeds.
 * @param {object} env - Worker environment bindings
 * @param {string} channelId
 * @returns {Promise<object|null>}
 */
export async function getChannelById(env, channelId) {
  const channel = await dbGetChannelById(env.DB, channelId);
  if (!channel) {
    return null;
  }
  const feeds = (await getFeedsByChannelId(env.DB, channel.id)) || [];
  channel.feeds = feeds.map((f) => ({ id: f.id, name: f.name, url: f.url }));
  return channel;
}

/**
 * Get verification rate limit settings from DB, with hardcoded fallbacks.
 * @param {object} env - Worker environment bindings
 * @returns {Promise<{ maxAttempts: number, windowHours: number }>}
 */
export async function getVerifyLimits(env) {
  const config = await getSiteConfig(env.DB);
  return {
    maxAttempts: config?.verifyMaxAttempts ?? 3,
    windowHours: config?.verifyWindowHours ?? 24
  };
}

/**
 * Collect all CORS origins from all configured channels.
 * @param {object} env - Worker environment bindings
 * @returns {Promise<string[]>}
 */
export async function getAllCorsOrigins(env) {
  const channels = await dbGetAllChannels(env.DB);
  const origins = new Set();
  for (const channel of channels) {
    if (channel.corsOrigins) {
      for (const origin of channel.corsOrigins) {
        origins.add(origin);
      }
    }
  }
  return [...origins];
}

/**
 * Get rate limit config for all endpoints from DB, with hardcoded fallbacks.
 * Each entry includes windowSeconds for rate-limit.js compatibility.
 * @param {object} env - Worker environment bindings
 * @returns {Promise<Record<string, { maxRequests: number, windowHours: number, windowSeconds: number }>>}
 */
export async function getRateLimitConfig(env) {
  const dbConfig = await getRateLimitConfigs(env.DB);
  const config = {};
  for (const endpoint of Object.keys(RATE_LIMIT_DEFAULTS)) {
    const entry = dbConfig[endpoint] || RATE_LIMIT_DEFAULTS[endpoint];
    config[endpoint] = {
      ...entry,
      windowSeconds: entry.windowHours * 3600
    };
  }
  return config;
}
