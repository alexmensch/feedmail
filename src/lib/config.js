/**
 * Configuration helpers for parsing CHANNELS and verification limits from env.
 */

let channelsCache = null;

/**
 * Validate DOMAIN and all channel configuration. Throws on invalid config.
 * @param {string} domain - The DOMAIN env var value
 * @param {Array<object>} channels - Parsed channel config array
 */
function validateConfig(domain, channels) {
  // Validate DOMAIN
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

  // Validate each channel
  const requiredFields = ["id", "siteName", "siteUrl", "fromUser", "fromName", "corsOrigins"];

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const label = channel.id || `index ${i}`;

    for (const field of requiredFields) {
      if (!channel[field]) {
        throw new Error(`Channel "${label}": missing required field "${field}"`);
      }
    }

    // Validate fromUser
    if (/[@\s]/.test(channel.fromUser)) {
      throw new Error(
        `Channel "${label}": fromUser must not contain '@' or whitespace`,
      );
    }

    // Validate feeds
    if (channel.feeds) {
      const seenUrls = new Set();
      const seenNames = new Set();

      for (let j = 0; j < channel.feeds.length; j++) {
        const feed = channel.feeds[j];

        if (!feed.name || typeof feed.name !== "string") {
          throw new Error(
            `Channel "${label}": feed at index ${j} has missing or empty "name"`,
          );
        }
        if (!feed.url || typeof feed.url !== "string") {
          throw new Error(
            `Channel "${label}": feed at index ${j} has missing or empty "url"`,
          );
        }

        if (seenUrls.has(feed.url)) {
          throw new Error(
            `Channel "${label}": duplicate feed URL "${feed.url}"`,
          );
        }
        seenUrls.add(feed.url);

        const lowerName = feed.name.toLowerCase();
        if (seenNames.has(lowerName)) {
          throw new Error(
            `Channel "${label}": duplicate feed name "${feed.name}" (case-insensitive)`,
          );
        }
        seenNames.add(lowerName);
      }
    }
  }
}

/**
 * Parse, validate, and return all configured channels.
 * @param {object} env - Worker environment bindings
 * @returns {Array<object>} Array of channel config objects
 */
export function getChannels(env) {
  if (!channelsCache) {
    const channels = JSON.parse(env.CHANNELS);
    validateConfig(env.DOMAIN, channels);
    channelsCache = channels;
  }
  return channelsCache;
}

/**
 * Look up a channel by its ID.
 * @param {object} env - Worker environment bindings
 * @param {string} channelId - The channel ID to look up
 * @returns {object|null} Channel config or null if not found
 */
export function getChannelById(env, channelId) {
  const channels = getChannels(env);
  return channels.find((c) => c.id === channelId) || null;
}

/**
 * Get verification rate limit settings.
 * @param {object} env - Worker environment bindings
 * @returns {{ maxAttempts: number, windowHours: number }}
 */
export function getVerifyLimits(env) {
  return {
    maxAttempts: parseInt(env.VERIFY_MAX_ATTEMPTS || "3", 10),
    windowHours: parseInt(env.VERIFY_WINDOW_HOURS || "24", 10),
  };
}

/**
 * Collect all CORS origins from all configured channels.
 * @param {object} env - Worker environment bindings
 * @returns {string[]} Array of allowed origin URLs
 */
export function getAllCorsOrigins(env) {
  const channels = getChannels(env);
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
