---
guid: FF8F870D-4FD8-491F-9DF2-A4D5E332BE22
date: 2026-03-07
feature: admin-auth-passkey
depends-on: 233E72F0-C4B3-41A8-8A4E-5AEC156C456E
---

## Feature: Admin Auth — Passkey

Adds passkey (WebAuthn) authentication to the admin console as the primary login method, layered on top of the magic link auth system. Enables the admin to log in with a single biometric/PIN tap instead of waiting for an email. Magic link remains as a fallback for new devices or lost passkeys.

## Requirements

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | Passkey database schema | A D1 migration adds the `passkey_credentials` table (credential_id, public_key, counter, name, created_at). | Migration applies cleanly to existing D1 database alongside the auth tables from the magic link feature. Table does not conflict with existing tables. Schema supports all operations defined in subsequent requirements. | Migration is idempotent — re-running does not fail or corrupt data. |
| 2 | Passkey registration | An authenticated admin can register a WebAuthn passkey credential from a passkey management page. Registration uses the WebAuthn registration ceremony via `@simplewebauthn/server`. The credential's public key, credential ID, counter, and a user-provided name are stored in D1. Passkey management page is functional but unstyled. | Registration ceremony completes successfully. Credential is stored in D1 with all required fields. Admin can assign a display name to the credential (e.g., "MacBook Pro", "iPhone"). Registration is only available to authenticated sessions. | WebAuthn not supported by browser: registration button is hidden or disabled with an explanation. Registration ceremony cancelled by user: no credential stored, admin returned to management page. Registration fails server-side: error shown, admin can retry. |
| 3 | Passkey authentication | The login page is updated to offer passkey authentication when one or more credentials exist in D1. A "Sign in with passkey" button is displayed alongside the email input. Successful WebAuthn assertion verification creates a session identical to magic link verification (same cookie, same TTL). Counter is updated on successful authentication. | Passkey assertion succeeds: session created, redirect to `/admin`. Counter is incremented and stored. Login experience is a single button tap + biometric/PIN. Login page shows both email input and passkey button when credentials exist. | Assertion fails (wrong authenticator, cancelled): error message on login page, admin can retry or fall back to magic link. Counter goes backwards (possible cloned authenticator): authentication rejected with a warning. No credentials exist in D1: passkey button not shown, magic link is the only option. |
| 4 | Passkey management | An authenticated admin can view all registered passkeys (name, registration date), register additional passkeys, rename a passkey, and remove a passkey. Passkey management page is functional but unstyled. | Passkey list shows all registered credentials with names and dates. Admin can add new credentials (reuses registration flow from R2). Admin can rename any credential. Admin can delete any credential. | Removing the last passkey: allowed, but admin is warned that magic link will be the only login method. Removing a passkey while another session is using it: no effect on existing sessions (sessions are independent of credentials). |
| 5 | Bootstrap experience | When no passkey credentials exist, a successfully authenticated session (via magic link) shows a prominent, non-blocking prompt encouraging the admin to register their first passkey. The prompt can be dismissed but reappears on subsequent logins until a passkey is registered. Bootstrap prompt is functional but unstyled. | First magic link login with no passkeys: prompt appears. Admin can dismiss the prompt and proceed. Admin registers a passkey: prompt no longer appears. Prompt reappears on next login if dismissed without registering. | Admin who genuinely doesn't want passkeys can always dismiss and use magic link only — the prompt is advisory, never blocking. |

## Out of scope

- **Visual styling of passkey pages** (management page, bootstrap prompt, passkey button on login) — all pages are functional but unstyled; visual design is applied by the Admin Console UI feature
- **Multi-user admin support** — single admin user only; all passkeys belong to the one admin
- **Passwordless fallback beyond magic link** — no SMS, no TOTP, no recovery codes
- **Audit logging of passkey events** (registration, removal, authentication) — potential future enhancement
