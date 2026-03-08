-- Admin session storage
CREATE TABLE admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_admin_sessions_token ON admin_sessions(token);

-- Magic link token storage
CREATE TABLE magic_link_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_magic_link_tokens_token ON magic_link_tokens(token);

-- Credential storage (admin_email, resend_api_key, admin_api_key)
CREATE TABLE credentials (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
