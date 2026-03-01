-- IP-based rate limiting per endpoint.
-- Tracks individual requests for rolling window counting.
CREATE TABLE rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rate_limits_lookup ON rate_limits(ip, endpoint, requested_at);
