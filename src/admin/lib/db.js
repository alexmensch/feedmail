/**
 * D1 query helpers for admin auth: magic link tokens and sessions.
 */

/** Magic link token TTL in seconds (15 minutes). */
export const MAGIC_LINK_TTL_SECONDS = 900;

// ─── Magic Link Tokens ──────────────────────────────────────────────────────

export async function createMagicLinkToken(db, token, expiresAt) {
  return db
    .prepare("INSERT INTO magic_link_tokens (token, expires_at) VALUES (?, ?)")
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

// ─── Passkey Credentials ────────────────────────────────────────────────────

export async function createPasskeyCredential(
  db,
  { credentialId, publicKey, counter, transports, name }
) {
  return db
    .prepare(
      `INSERT INTO passkey_credentials (credential_id, public_key, counter, transports, name)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      credentialId,
      publicKey,
      counter || 0,
      transports ? JSON.stringify(transports) : null,
      name || null
    )
    .run();
}

export async function getPasskeyCredentials(db) {
  const { results } = await db
    .prepare(
      "SELECT id, credential_id, public_key, counter, transports, name, created_at FROM passkey_credentials ORDER BY created_at"
    )
    .all();
  return results;
}

export async function getPasskeyCredentialById(db, credentialId) {
  return db
    .prepare(
      "SELECT id, credential_id, public_key, counter, transports, name, created_at FROM passkey_credentials WHERE credential_id = ? LIMIT 1"
    )
    .bind(credentialId)
    .first();
}

export async function getPasskeyCredentialCount(db) {
  const result = await db
    .prepare("SELECT COUNT(*) as count FROM passkey_credentials")
    .first();
  return result?.count || 0;
}

export async function updatePasskeyCredentialCounter(
  db,
  credentialId,
  counter
) {
  return db
    .prepare(
      "UPDATE passkey_credentials SET counter = ? WHERE credential_id = ?"
    )
    .bind(counter, credentialId)
    .run();
}

export async function updatePasskeyCredentialName(db, credentialId, name) {
  return db
    .prepare("UPDATE passkey_credentials SET name = ? WHERE credential_id = ?")
    .bind(name, credentialId)
    .run();
}

export async function deletePasskeyCredential(db, credentialId) {
  return db
    .prepare("DELETE FROM passkey_credentials WHERE credential_id = ?")
    .bind(credentialId)
    .run();
}

// ─── WebAuthn Challenges ────────────────────────────────────────────────────

export async function createWebAuthnChallenge(
  db,
  { sessionToken, challenge, type, expiresAt }
) {
  return db
    .prepare(
      `INSERT INTO webauthn_challenges (session_token, challenge, type, expires_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(sessionToken, challenge, type, expiresAt)
    .run();
}

export async function getWebAuthnChallenge(db, sessionToken, type) {
  return db
    .prepare(
      "SELECT * FROM webauthn_challenges WHERE session_token = ? AND type = ? LIMIT 1"
    )
    .bind(sessionToken, type)
    .first();
}

export async function deleteWebAuthnChallenge(db, sessionToken, type) {
  return db
    .prepare(
      "DELETE FROM webauthn_challenges WHERE session_token = ? AND type = ?"
    )
    .bind(sessionToken, type)
    .run();
}

export async function cleanupExpiredChallenges(db) {
  return db
    .prepare(
      "DELETE FROM webauthn_challenges WHERE expires_at < datetime('now')"
    )
    .run();
}
