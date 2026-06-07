-- Enforce a single outstanding WebAuthn challenge per (session_token, type).
-- createWebAuthnChallenge upserts on this key and consumeChallenge deletes by
-- it, so at most one matching row may exist; without the constraint, repeated
-- options requests left duplicates that resolved/deleted inconsistently.

-- Drop any pre-existing duplicates, keeping the newest row per (token, type).
DELETE FROM webauthn_challenges
WHERE id NOT IN (
  SELECT MAX(id) FROM webauthn_challenges GROUP BY session_token, type
);

-- The composite unique index also serves the (session_token, type) lookups,
-- making the old single-column index redundant.
DROP INDEX IF EXISTS idx_webauthn_challenges_session_token;

CREATE UNIQUE INDEX idx_webauthn_challenges_session_type
  ON webauthn_challenges(session_token, type);
