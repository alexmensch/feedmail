/**
 * D1 database query helpers for subscribers, verification attempts, and sent items.
 */

// ─── Subscribers ────────────────────────────────────────────────────────────

export async function getSubscriberByEmail(db, email, siteId) {
  return db
    .prepare(
      "SELECT * FROM subscribers WHERE email = ? AND site_id = ? LIMIT 1",
    )
    .bind(email, siteId)
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

export async function getVerifiedSubscribers(db, siteId) {
  const { results } = await db
    .prepare(
      "SELECT * FROM subscribers WHERE site_id = ? AND status = 'verified'",
    )
    .bind(siteId)
    .all();
  return results;
}

export async function insertSubscriber(
  db,
  { siteId, email, verifyToken, unsubscribeToken },
) {
  return db
    .prepare(
      `INSERT INTO subscribers (site_id, email, status, verify_token, unsubscribe_token)
       VALUES (?, ?, 'pending', ?, ?)`,
    )
    .bind(siteId, email, verifyToken, unsubscribeToken)
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

// ─── Admin Queries ──────────────────────────────────────────────────────────

export async function getSubscriberStats(db, siteId) {
  const { results } = await db
    .prepare(
      `SELECT status, COUNT(*) as count FROM subscribers
       WHERE site_id = ? GROUP BY status`,
    )
    .bind(siteId)
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

export async function getSubscriberList(db, siteId, statusFilter) {
  let query = "SELECT email, status, created_at, verified_at, unsubscribed_at FROM subscribers WHERE site_id = ?";
  const binds = [siteId];

  if (statusFilter) {
    query += " AND status = ?";
    binds.push(statusFilter);
  }

  query += " ORDER BY created_at DESC";

  const { results } = await db.prepare(query).bind(...binds).all();
  return results;
}
