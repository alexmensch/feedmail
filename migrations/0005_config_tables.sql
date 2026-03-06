-- Site-level configuration (single row)
CREATE TABLE site_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  verify_max_attempts INTEGER NOT NULL DEFAULT 3,
  verify_window_hours INTEGER NOT NULL DEFAULT 24
);

-- Per-endpoint rate limit configuration
CREATE TABLE rate_limit_config (
  endpoint TEXT PRIMARY KEY,
  max_requests INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL
);

-- Seed default rate limit values
INSERT INTO rate_limit_config (endpoint, max_requests, window_seconds) VALUES ('subscribe', 10, 3600);
INSERT INTO rate_limit_config (endpoint, max_requests, window_seconds) VALUES ('verify', 20, 3600);
INSERT INTO rate_limit_config (endpoint, max_requests, window_seconds) VALUES ('unsubscribe', 20, 3600);
INSERT INTO rate_limit_config (endpoint, max_requests, window_seconds) VALUES ('send', 5, 3600);
INSERT INTO rate_limit_config (endpoint, max_requests, window_seconds) VALUES ('admin', 30, 3600);

-- Channel configuration (replaces CHANNELS env var)
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  site_name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  from_user TEXT NOT NULL,
  from_name TEXT NOT NULL,
  reply_to TEXT,
  company_name TEXT,
  company_address TEXT,
  cors_origins TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feeds as a child table of channels
CREATE TABLE feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel_id, url)
);

CREATE INDEX idx_feeds_channel_id ON feeds(channel_id);
