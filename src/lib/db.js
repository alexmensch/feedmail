/**
 * D1 database query helpers for subscribers, verification attempts, and sent items.
 */

// ─── Subscribers ────────────────────────────────────────────────────────────

export async function getSubscriberByEmail(db, email, channelId) {
  return db
    .prepare(
      "SELECT * FROM subscribers WHERE email = ? AND channel_id = ? LIMIT 1",
    )
    .bind(email, channelId)
    .first();
}

export async function getSubscriberByVerifyToken(db, token) {
  return db
    .prepare(
      "SELECT * FROM subscribers WHERE verify_token = ? AND status = 'pending' LIMIT 1",
    )
    .bind(token)
    .first();
}

export async function getSubscriberByUnsubscribeToken(db, token) {
  return db
    .prepare("SELECT * FROM subscribers WHERE unsubscribe_token = ? LIMIT 1")
    .bind(token)
    .first();
}

export async function getVerifiedSubscribers(db, channelId) {
  const { results } = await db
    .prepare(
      "SELECT * FROM subscribers WHERE channel_id = ? AND status = 'verified'",
    )
    .bind(channelId)
    .all();
  return results;
}

export async function insertSubscriber(
  db,
  { channelId, email, verifyToken, unsubscribeToken },
) {
  return db
    .prepare(
      `INSERT INTO subscribers (channel_id, email, status, verify_token, unsubscribe_token)
       VALUES (?, ?, 'pending', ?, ?)`,
    )
    .bind(channelId, email, verifyToken, unsubscribeToken)
    .run();
}

export async function resetSubscriberToPending(
  db,
  subscriberId,
  verifyToken,
) {
  return db
    .prepare(
      `UPDATE subscribers
       SET status = 'pending', verify_token = ?, created_at = datetime('now'),
           verified_at = NULL, unsubscribed_at = NULL
       WHERE id = ?`,
    )
    .bind(verifyToken, subscriberId)
    .run();
}

export async function updateVerifyToken(db, subscriberId, verifyToken) {
  return db
    .prepare(
      `UPDATE subscribers SET verify_token = ?, created_at = datetime('now') WHERE id = ?`,
    )
    .bind(verifyToken, subscriberId)
    .run();
}

export async function markSubscriberVerified(db, subscriberId) {
  return db
    .prepare(
      `UPDATE subscribers
       SET status = 'verified', verified_at = datetime('now'), verify_token = NULL
       WHERE id = ?`,
    )
    .bind(subscriberId)
    .run();
}

export async function markSubscriberUnsubscribed(db, subscriberId) {
  return db
    .prepare(
      `UPDATE subscribers
       SET status = 'unsubscribed', unsubscribed_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(subscriberId)
    .run();
}

// ─── Verification Attempts ──────────────────────────────────────────────────

export async function countRecentVerificationAttempts(
  db,
  subscriberId,
  windowHours,
) {
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count FROM verification_attempts
       WHERE subscriber_id = ? AND sent_at > datetime('now', ? || ' hours')`,
    )
    .bind(subscriberId, `-${windowHours}`)
    .first();
  return result?.count || 0;
}

export async function insertVerificationAttempt(db, subscriberId) {
  return db
    .prepare("INSERT INTO verification_attempts (subscriber_id) VALUES (?)")
    .bind(subscriberId)
    .run();
}

export async function clearVerificationAttempts(db, subscriberId) {
  return db
    .prepare("DELETE FROM verification_attempts WHERE subscriber_id = ?")
    .bind(subscriberId)
    .run();
}

// ─── Sent Items ─────────────────────────────────────────────────────────────

export async function isFeedSeeded(db, feedUrl) {
  const result = await db
    .prepare("SELECT COUNT(*) as count FROM sent_items WHERE feed_url = ?")
    .bind(feedUrl)
    .first();
  return (result?.count || 0) > 0;
}

export async function isItemSent(db, itemId, feedUrl) {
  const result = await db
    .prepare(
      "SELECT id FROM sent_items WHERE item_id = ? AND feed_url = ? LIMIT 1",
    )
    .bind(itemId, feedUrl)
    .first();
  return !!result;
}

export async function insertSentItem(
  db,
  { itemId, feedUrl, title, recipientCount },
) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO sent_items (item_id, feed_url, title, recipient_count)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(itemId, feedUrl, title || "", recipientCount)
    .run();
}

// ─── Subscriber Sends (per-subscriber deduplication) ────────────────────────

export async function isItemSentToSubscriber(db, subscriberId, itemId, feedUrl) {
  const result = await db
    .prepare(
      "SELECT id FROM subscriber_sends WHERE subscriber_id = ? AND item_id = ? AND feed_url = ? LIMIT 1",
    )
    .bind(subscriberId, itemId, feedUrl)
    .first();
  return !!result;
}

export async function insertSubscriberSend(db, subscriberId, itemId, feedUrl) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO subscriber_sends (subscriber_id, item_id, feed_url)
       VALUES (?, ?, ?)`,
    )
    .bind(subscriberId, itemId, feedUrl)
    .run();
}

export async function deleteSubscriberSends(db, itemId, feedUrl) {
  return db
    .prepare("DELETE FROM subscriber_sends WHERE item_id = ? AND feed_url = ?")
    .bind(itemId, feedUrl)
    .run();
}

// ─── Site Config ────────────────────────────────────────────────────────────

export async function getSiteConfig(db) {
  return db.prepare("SELECT * FROM site_config WHERE id = 1").first();
}

export async function upsertSiteConfig(db, { verifyMaxAttempts, verifyWindowHours }) {
  return db
    .prepare(
      `INSERT INTO site_config (id, verify_max_attempts, verify_window_hours)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         verify_max_attempts = excluded.verify_max_attempts,
         verify_window_hours = excluded.verify_window_hours`,
    )
    .bind(verifyMaxAttempts, verifyWindowHours)
    .run();
}

// ─── Rate Limit Config ──────────────────────────────────────────────────────

export async function getAllRateLimitConfig(db) {
  const { results } = await db
    .prepare("SELECT endpoint, max_requests, window_seconds FROM rate_limit_config")
    .all();
  return results;
}

export async function getRateLimitConfigByEndpoint(db, endpoint) {
  return db
    .prepare("SELECT max_requests, window_seconds FROM rate_limit_config WHERE endpoint = ?")
    .bind(endpoint)
    .first();
}

export async function upsertRateLimitConfig(db, endpoint, maxRequests, windowSeconds) {
  return db
    .prepare(
      `INSERT INTO rate_limit_config (endpoint, max_requests, window_seconds)
       VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         max_requests = excluded.max_requests,
         window_seconds = excluded.window_seconds`,
    )
    .bind(endpoint, maxRequests, windowSeconds)
    .run();
}

// ─── Channels ───────────────────────────────────────────────────────────────

export async function getAllChannels(db) {
  const { results } = await db
    .prepare(
      `SELECT id, site_name, site_url, from_user, from_name, reply_to,
              company_name, company_address, cors_origins, created_at, updated_at
       FROM channels ORDER BY created_at`,
    )
    .all();
  return results;
}

export async function getChannelFromDb(db, channelId) {
  return db
    .prepare(
      `SELECT id, site_name, site_url, from_user, from_name, reply_to,
              company_name, company_address, cors_origins, created_at, updated_at
       FROM channels WHERE id = ?`,
    )
    .bind(channelId)
    .first();
}

export async function insertChannel(db, data) {
  return db
    .prepare(
      `INSERT INTO channels (id, site_name, site_url, from_user, from_name, reply_to,
                             company_name, company_address, cors_origins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.id,
      data.siteName,
      data.siteUrl,
      data.fromUser,
      data.fromName,
      data.replyTo || null,
      data.companyName || null,
      data.companyAddress || null,
      JSON.stringify(data.corsOrigins),
    )
    .run();
}

export async function updateChannel(db, channelId, data) {
  return db
    .prepare(
      `UPDATE channels SET
         site_name = ?, site_url = ?, from_user = ?, from_name = ?,
         reply_to = ?, company_name = ?, company_address = ?, cors_origins = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      data.siteName,
      data.siteUrl,
      data.fromUser,
      data.fromName,
      data.replyTo || null,
      data.companyName || null,
      data.companyAddress || null,
      JSON.stringify(data.corsOrigins),
      channelId,
    )
    .run();
}

export async function deleteChannelCascade(db, channelId) {
  // Get feed URLs before deleting (needed for sent_items/subscriber_sends cleanup)
  const { results: feeds } = await db
    .prepare("SELECT url FROM feeds WHERE channel_id = ?")
    .bind(channelId)
    .all();

  const feedUrls = feeds.map((f) => f.url);

  // Delete sent_items and subscriber_sends for these feed URLs
  if (feedUrls.length > 0) {
    const placeholders = feedUrls.map(() => "?").join(", ");
    await db
      .prepare(`DELETE FROM sent_items WHERE feed_url IN (${placeholders})`)
      .bind(...feedUrls)
      .run();
    await db
      .prepare(`DELETE FROM subscriber_sends WHERE feed_url IN (${placeholders})`)
      .bind(...feedUrls)
      .run();
  }

  // Delete verification_attempts for this channel's subscribers
  await db
    .prepare(
      `DELETE FROM verification_attempts WHERE subscriber_id IN
       (SELECT id FROM subscribers WHERE channel_id = ?)`,
    )
    .bind(channelId)
    .run();

  // Delete subscribers
  await db
    .prepare("DELETE FROM subscribers WHERE channel_id = ?")
    .bind(channelId)
    .run();

  // Delete channel (cascades to feeds via FK)
  return db.prepare("DELETE FROM channels WHERE id = ?").bind(channelId).run();
}

// ─── Feeds ──────────────────────────────────────────────────────────────────

export async function getFeedsByChannelId(db, channelId) {
  const { results } = await db
    .prepare("SELECT id, channel_id, name, url FROM feeds WHERE channel_id = ? ORDER BY id")
    .bind(channelId)
    .all();
  return results;
}

export async function getFeedById(db, feedId, channelId) {
  return db
    .prepare("SELECT id, channel_id, name, url FROM feeds WHERE id = ? AND channel_id = ?")
    .bind(feedId, channelId)
    .first();
}

export async function insertFeed(db, channelId, name, url) {
  return db
    .prepare("INSERT INTO feeds (channel_id, name, url) VALUES (?, ?, ?)")
    .bind(channelId, name, url)
    .run();
}

export async function updateFeed(db, feedId, name, url) {
  return db
    .prepare("UPDATE feeds SET name = ?, url = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(name, url, feedId)
    .run();
}

export async function deleteFeedCascade(db, feedId) {
  // Get the feed URL for cleaning up sent_items/subscriber_sends
  const feed = await db
    .prepare("SELECT url FROM feeds WHERE id = ?")
    .bind(feedId)
    .first();

  if (feed) {
    await db
      .prepare("DELETE FROM sent_items WHERE feed_url = ?")
      .bind(feed.url)
      .run();
    await db
      .prepare("DELETE FROM subscriber_sends WHERE feed_url = ?")
      .bind(feed.url)
      .run();
  }

  return db.prepare("DELETE FROM feeds WHERE id = ?").bind(feedId).run();
}

export async function checkFeedUrlUnique(db, channelId, url, excludeFeedId = null) {
  const query = excludeFeedId
    ? "SELECT id FROM feeds WHERE channel_id = ? AND url = ? AND id != ? LIMIT 1"
    : "SELECT id FROM feeds WHERE channel_id = ? AND url = ? LIMIT 1";
  const binds = excludeFeedId ? [channelId, url, excludeFeedId] : [channelId, url];
  const result = await db.prepare(query).bind(...binds).first();
  return !result;
}

export async function checkFeedNameUnique(db, channelId, name, excludeFeedId = null) {
  // Case-insensitive comparison using SQLite LOWER()
  const query = excludeFeedId
    ? "SELECT id FROM feeds WHERE channel_id = ? AND LOWER(name) = LOWER(?) AND id != ? LIMIT 1"
    : "SELECT id FROM feeds WHERE channel_id = ? AND LOWER(name) = LOWER(?) LIMIT 1";
  const binds = excludeFeedId ? [channelId, name, excludeFeedId] : [channelId, name];
  const result = await db.prepare(query).bind(...binds).first();
  return !result;
}

// ─── Admin Queries ──────────────────────────────────────────────────────────

export async function getSubscriberStats(db, channelId) {
  const { results } = await db
    .prepare(
      `SELECT status, COUNT(*) as count FROM subscribers
       WHERE channel_id = ? GROUP BY status`,
    )
    .bind(channelId)
    .all();

  const stats = { total: 0, verified: 0, pending: 0, unsubscribed: 0 };
  for (const row of results) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }
  return stats;
}

export async function getSentItemStats(db, feedUrls) {
  const placeholders = feedUrls.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT COUNT(*) as total, MAX(sent_at) as lastSentAt
       FROM sent_items WHERE feed_url IN (${placeholders}) AND recipient_count > 0`,
    )
    .bind(...feedUrls)
    .first();
  return {
    total: result?.total || 0,
    lastSentAt: result?.lastSentAt || null,
  };
}

export async function getSubscriberList(db, channelId, statusFilter) {
  let query = "SELECT email, status, created_at, verified_at, unsubscribed_at FROM subscribers WHERE channel_id = ?";
  const binds = [channelId];

  if (statusFilter) {
    query += " AND status = ?";
    binds.push(statusFilter);
  }

  query += " ORDER BY created_at DESC";

  const { results } = await db.prepare(query).bind(...binds).all();
  return results;
}
