/**
 * IP-based rate limiting using D1.
 * Rolling window counting — tracks individual requests per IP per endpoint.
 */

/** Maximum age for rate limit rows before they are eligible for cleanup (7 days). */
export const STALE_ROW_MAX_AGE_SECONDS = 604800;

/** Probability of triggering global stale row cleanup on each rate limit check. */
export const CLEANUP_PROBABILITY = 0.01;

/**
 * Check whether a request from the given IP to the given endpoint is allowed.
 * If allowed, records the request. If denied, returns retryAfter in seconds.
 *
 * Uses the "oldest request expiry" strategy for Retry-After: the value tells
 * the client when the first slot in the rolling window will free up, plus
 * 0-30 seconds of random jitter to prevent thundering herd retries.
 *
 * @param {object} db - D1 database binding
 * @param {string} ip - Client IP address
 * @param {string} endpoint - Logical endpoint name (key of RATE_LIMITS)
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @param {number} windowSeconds - Rolling window size in seconds
 * @returns {Promise<{ allowed: boolean, retryAfter?: number }>}
 */
export async function checkRateLimit(
  db,
  ip,
  endpoint,
  maxRequests,
  windowSeconds
) {
  // Probabilistically clean up all stale rows across the entire table
  if (Math.random() < CLEANUP_PROBABILITY) {
    cleanupStaleRateLimits(db).catch((err) =>
      console.error("Stale rate limit cleanup failed:", err)
    );
  }

  // Clean up expired rows for this IP+endpoint (keeps table small)
  await db
    .prepare(
      "DELETE FROM rate_limits WHERE ip = ? AND endpoint = ? AND requested_at < datetime('now', ? || ' seconds')"
    )
    .bind(ip, endpoint, `-${windowSeconds}`)
    .run();

  // Count recent requests within the rolling window
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count, MIN(requested_at) as oldest
       FROM rate_limits
       WHERE ip = ? AND endpoint = ? AND requested_at >= datetime('now', ? || ' seconds')`
    )
    .bind(ip, endpoint, `-${windowSeconds}`)
    .first();

  const count = result?.count || 0;

  if (count >= maxRequests) {
    // Calculate retryAfter: when the oldest request in the window expires
    // Add 0-30s random jitter to prevent thundering herd retries
    const oldest = result?.oldest ? new Date(`${result.oldest}Z`) : new Date();
    const expiresAt = new Date(oldest.getTime() + windowSeconds * 1000);
    const jitter = Math.floor(Math.random() * 31);
    const retryAfter =
      Math.max(1, Math.ceil((expiresAt - new Date()) / 1000)) + jitter;

    return { allowed: false, retryAfter };
  }

  // Record this request
  await db
    .prepare("INSERT INTO rate_limits (ip, endpoint) VALUES (?, ?)")
    .bind(ip, endpoint)
    .run();

  return { allowed: true };
}

/**
 * Delete all rate_limits rows older than STALE_ROW_MAX_AGE_SECONDS.
 * Designed to be called fire-and-forget from checkRateLimit.
 *
 * @param {object} db - D1 database binding
 * @returns {Promise<object>} D1 run result
 */
export async function cleanupStaleRateLimits(db) {
  return db
    .prepare(
      "DELETE FROM rate_limits WHERE requested_at < datetime('now', ? || ' seconds')"
    )
    .bind(`-${STALE_ROW_MAX_AGE_SECONDS}`)
    .run();
}

/**
 * Map a URL pathname to its rate limit endpoint name.
 * Returns null if the path has no rate limiting configured.
 *
 * @param {string} pathname - URL pathname
 * @returns {string|null} Endpoint name or null
 */
export function getEndpointName(pathname) {
  if (pathname === "/api/subscribe") {
    return "subscribe";
  }
  if (pathname === "/api/verify") {
    return "verify";
  }
  if (pathname === "/api/unsubscribe") {
    return "unsubscribe";
  }
  if (pathname === "/api/send") {
    return "send";
  }
  if (pathname.startsWith("/api/admin/")) {
    return "admin";
  }
  return null;
}
