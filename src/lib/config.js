/**
 * Configuration helpers for parsing SITES and verification limits from env.
 */

let sitesCache = null;

/**
 * Parse and return all configured sites.
 * @param {object} env - Worker environment bindings
 * @returns {Array<object>} Array of site config objects
 */
export function getSites(env) {
  if (!sitesCache) {
    sitesCache = JSON.parse(env.SITES);
  }
  return sitesCache;
}

/**
 * Look up a site by its ID.
 * @param {object} env - Worker environment bindings
 * @param {string} siteId - The site ID to look up
 * @returns {object|null} Site config or null if not found
 */
export function getSiteById(env, siteId) {
  const sites = getSites(env);
  return sites.find((s) => s.id === siteId) || null;
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
 * Collect all CORS origins from all configured sites.
 * @param {object} env - Worker environment bindings
 * @returns {string[]} Array of allowed origin URLs
 */
export function getAllCorsOrigins(env) {
  const sites = getSites(env);
  const origins = new Set();
  for (const site of sites) {
    if (site.corsOrigins) {
      for (const origin of site.corsOrigins) {
        origins.add(origin);
      }
    }
  }
  return [...origins];
}
