-- Subscribers are scoped to a site
CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verify_token TEXT,
  unsubscribe_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT,
  unsubscribed_at TEXT,
  UNIQUE(email, site_id)
);

CREATE INDEX idx_subscribers_site_status ON subscribers(site_id, status);
CREATE INDEX idx_subscribers_verify_token ON subscribers(verify_token);
CREATE INDEX idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);

-- Rate-limits verification emails per subscriber
CREATE TABLE verification_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_verification_attempts_subscriber ON verification_attempts(subscriber_id);

-- Tracks which feed items have been emailed
CREATE TABLE sent_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  title TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(item_id, feed_url)
);

CREATE INDEX idx_sent_items_lookup ON sent_items(item_id, feed_url);
CREATE INDEX idx_sent_items_feed ON sent_items(feed_url);
