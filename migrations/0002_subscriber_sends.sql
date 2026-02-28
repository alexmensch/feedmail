-- Per-subscriber send tracking for deduplication during partial sends.
-- When a quota or rate limit interrupts a send run, this table records
-- which subscribers already received a given item so they aren't re-sent
-- on the next retry.
CREATE TABLE subscriber_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subscriber_id, item_id, feed_url)
);

CREATE INDEX idx_subscriber_sends_item ON subscriber_sends(item_id, feed_url);
