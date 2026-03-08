/**
 * D1 query helpers for admin auth: magic link tokens and sessions.
 */

/** Magic link token TTL in seconds (15 minutes). */
export const MAGIC_LINK_TTL_SECONDS = 900;

// ─── Magic Link Tokens ──────────────────────────────────────────────────────

export async function createMagicLinkToken(db, token, expiresAt) {
  return db
    .prepare(
      "INSERT INTO magic_link_tokens (token, expires_at) VALUES (?, ?)"
    )
    .bind(token, expiresAt)
    .run();
}

export async function getMagicLinkToken(db, token) {
  return db
    .prepare("SELECT * FROM magic_link_tokens WHERE token = ? LIMIT 1")
    .bind(token)
    .first();
}

export async function markMagicLinkTokenUsed(db, token) {
  return db
    .prepare(
      "UPDATE magic_link_tokens SET used = 1 WHERE token = ? AND used = 0"
    )
    .bind(token)
    .run();
}

// ─── Admin Sessions ──────────────────────────────────────────────────────────

export async function createSession(db, token, expiresAt) {
  return db
    .prepare("INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)")
    .bind(token, expiresAt)
    .run();
}

export async function getSession(db, token) {
  return db
    .prepare("SELECT * FROM admin_sessions WHERE token = ? LIMIT 1")
    .bind(token)
    .first();
}

export async function deleteSession(db, token) {
  return db
    .prepare("DELETE FROM admin_sessions WHERE token = ?")
    .bind(token)
    .run();
}
