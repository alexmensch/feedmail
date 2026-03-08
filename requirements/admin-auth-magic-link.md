---
guid: 233E72F0-C4B3-41A8-8A4E-5AEC156C456E
date: 2026-03-07
feature: admin-auth-magic-link
---

## Feature: Admin Auth — Magic Link

A session-based authentication system for the feedmail admin console, using magic link emails as the login method. Establishes the admin Worker, session management, and protected route infrastructure that all subsequent admin features build on. Enables a single authorized admin (identified by an admin email address stored in D1) to securely access the admin console at `{DOMAIN}/admin/*` without passwords or third-party SSO. Runs as a separate Cloudflare Worker in the same repository.

## Requirements

| #   | Requirement                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Acceptance Criteria                                                                                                                                                                                                                                                                                     | Edge Cases / Error Conditions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Admin Worker deployment         | A separate Cloudflare Worker serves all `/admin/*` routes, configured via `wrangler.admin.toml` with a shared D1 binding and `DOMAIN` env var. Route pattern `{DOMAIN}/admin/*` coexists with the existing `{DOMAIN}/api/*` pattern on the same zone. Admin email, Resend API key, and admin API key are stored in D1 (not as Wrangler secrets) and seeded by the setup script via direct D1 insertion. The admin Worker reads the admin API key from D1 to authenticate its requests to the API Worker. The API Worker also reads the admin API key from D1 to validate incoming requests. Deployment of both workers is handled by a single setup flow so the self-hoster experience feels like one deployment, not two. | Worker responds to requests at `/admin/*`. D1 binding connects to the same database as the API Worker. Worker is deployable independently of the API Worker. Both workers authenticate using the admin API key stored in D1. Setup script seeds admin email, Resend API key, and admin API key into D1. | Admin email not configured in D1: Worker starts but login page displays a clear setup error message for the self-hoster. Resend API key not configured in D1: magic link emails cannot be sent; error is logged and user sees the standard "check your email" page (no info leakage). Admin API key not configured in D1: admin Worker cannot authenticate against the API Worker; admin pages display a setup error message. `DOMAIN` misconfigured: magic link URLs are broken; validated on startup or first request. |
| 2   | Auth database schema            | A D1 migration adds two tables: `admin_sessions` (session token, created_at, expires_at) and `magic_link_tokens` (token, created_at, expires_at, used). The same migration adds D1 storage for admin email, Resend API key, and admin API key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Migration applies cleanly to existing D1 database. Tables and schema changes do not conflict with existing feedmail tables. Schema supports all operations defined in subsequent requirements. Admin email, Resend API key, and admin API key are queryable from D1 after migration and seeding.        | Migration is idempotent — re-running does not fail or corrupt data. Unseeded database (migration applied but setup script not yet run): queries return null/empty for credentials.                                                                                                                                                                                                                                                                                                                                       |
| 3   | Login page                      | An unauthenticated page at `/admin/login` displays an email input field for magic link login. Pages delivered by this feature are functional but unstyled — visual design is applied by the Admin Console UI feature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Page loads without authentication. Email input and submit button are present. Page is functional HTML — no JavaScript framework required for basic operation.                                                                                                                                           | Already authenticated admin visiting `/admin/login` is redirected to `/admin`. Browser with JavaScript disabled can still submit the email form.                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | Magic link request              | Submitting an email on the login page generates a single-use token and sends a magic link email if the address matches the admin email stored in D1 (case-insensitive comparison). The response page always shows "Check your email" regardless of whether the email matched. Confirmation page is functional but unstyled.                                                                                                                                                                                                                                                                                                                                                                                                | Matching email: token created in D1, email sent, confirmation page shown. Non-matching email: no token created, no email sent, same confirmation page shown.                                                                                                                                            | Empty email submitted: validation error shown on login page. Rapid repeated submissions: rate limited (see R8). Admin email stored with mixed case: comparison is case-insensitive.                                                                                                                                                                                                                                                                                                                                      |
| 5   | Magic link email delivery       | A magic link email is sent via Resend using the API key stored in D1, containing a unique token URL: `https://{DOMAIN}/admin/verify?token={token}`. From address uses the `DOMAIN`. Email clearly identifies itself as a feedmail admin login link.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Email is delivered with a clickable link containing a valid token. Link points to the correct domain. Email body explains what the link is for ("Sign in to your feedmail admin console").                                                                                                              | Resend API failure: error is logged; user sees the same "check your email" page (no info leakage). Resend rate limit hit: same behavior as API failure. Resend API key missing from D1: same behavior as API failure (no info leakage).                                                                                                                                                                                                                                                                                  |
| 6   | Magic link verification         | Clicking the magic link at `/admin/verify` validates the token, marks it as used, creates a session, sets a session cookie, and redirects to `/admin`. Tokens are single-use and expire after 15 minutes. Error pages include a link back to `/admin/login`. Error pages are functional but unstyled.                                                                                                                                                                                                                                                                                                                                                                                                                      | Valid, unused, non-expired token: session created, redirect to `/admin`. Used token: error page ("This link has already been used") with link to login. Expired token: error page ("This link has expired") with link to login.                                                                         | Token that doesn't exist in D1: same error as expired (no info leakage about valid token formats) with link to login. Multiple tabs/windows clicking same link: first succeeds, others see "already used" with link to login.                                                                                                                                                                                                                                                                                            |
| 7   | Session management              | Authenticated sessions use an HTTP-only, Secure, SameSite=Strict cookie with a 24-hour TTL. Sessions are stored in D1 with an explicit `expires_at` timestamp. A logout action at `/admin/logout` destroys the session in D1 and clears the cookie. Session validation is enforced by the protected route middleware (R9) on every request to a protected route.                                                                                                                                                                                                                                                                                                                                                           | Session cookie is set on successful magic link verification. Cookie is HTTP-only, Secure, SameSite=Strict. Requests with valid, non-expired session proceed normally. Logout clears both the D1 row and the cookie.                                                                                     | Expired session: redirect to `/admin/login`. Tampered/invalid session token in cookie: redirect to `/admin/login`. D1 session row deleted (e.g., manual cleanup) while cookie still exists: redirect to `/admin/login`. Multiple simultaneous sessions from different devices are allowed.                                                                                                                                                                                                                               |
| 8   | Rate limiting on auth endpoints | Magic link requests and login page loads are rate-limited per IP using the existing `rate_limits` D1 table and rolling window pattern. Limits prevent email bombing via magic link requests and brute-force attempts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Magic link requests exceeding the rate limit receive a 429 response with a Retry-After header. Rate limit uses the same mechanism as existing feedmail endpoints. Rate limit for auth endpoints is configurable via admin config API (same as other endpoints).                                         | Rate limit applies regardless of whether the submitted email matches the admin email (prevents timing-based info leakage). Legitimate admin locked out by rate limit: must wait for window to expire.                                                                                                                                                                                                                                                                                                                    |
| 9   | Protected route middleware      | All `/admin/*` routes except `/admin/login` and `/admin/verify` require a valid, non-expired session. Unauthenticated or expired requests redirect to `/admin/login` with the originally requested path preserved for post-login redirect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Unauthenticated request to `/admin`: redirect to `/admin/login`. After login: redirect back to originally requested page. `/admin/login` and `/admin/verify` are accessible without a session. `/admin/logout` is accessible with or without a session (idempotent).                                    | Direct access to `/admin/verify` without a token parameter: error page. Deeply nested admin paths (e.g., `/admin/channels/123/feeds`) preserve full path for redirect.                                                                                                                                                                                                                                                                                                                                                   |

## Out of scope

- **Passkey authentication** — separate feature (Admin Auth — Passkey), built on top of magic link auth
- **Visual styling of auth pages** (login, confirmation, error pages) — all pages are functional but unstyled; visual design is applied by the Admin Console UI feature
- **Manual code entry fallback for magic link** — deferred as an additive enhancement
- **Multi-user admin support** — single admin user only for this iteration
- **Password-based authentication** — not part of the auth model
- **SSO/OAuth providers** (Google, GitHub, etc.) — explicitly excluded
- **"Remember me" / extended session duration options** — 24-hour TTL is fixed
- **API key management through the UI** — deferred to Admin Console Enhancements feature
- **Email template customization for magic link emails** — standard template only
- **Audit logging of auth events** (login, logout) — potential future enhancement

## Technical Specification

### Summary

Reorganizes `src/` into `api/`, `admin/`, and `shared/` subdirectories, then adds a separate Admin Worker with magic link authentication. Three credentials (admin email, Resend API key, admin API key) transition from Wrangler secrets to a D1 `credentials` table with env var fallbacks.

### Directory Reorganization

```
src/
  api/
    worker.js                    # (was src/index.js) API Worker entry point
    routes/
      subscribe.js               # (was src/routes/subscribe.js)
      verify.js                  # (was src/routes/verify.js)
      unsubscribe.js             # (was src/routes/unsubscribe.js)
      send.js                    # (was src/routes/send.js)
      admin.js                   # (was src/routes/admin.js) API admin router
      admin-config.js            # (was src/routes/admin-config.js)
      admin-channels.js          # (was src/routes/admin-channels.js)
      admin-feeds.js             # (was src/routes/admin-feeds.js)
    lib/
      cors.js                    # (was src/lib/cors.js) API-only
      feed-parser.js             # (was src/lib/feed-parser.js) API-only
      html-to-text.js            # (was src/lib/html-to-text.js) API-only
  admin/
    worker.js                    # Admin Worker entry point
    routes/
      auth.js                    # Login, verify, logout handlers
    lib/
      db.js                      # Session + magic link token D1 helpers
      session.js                 # Cookie parsing, session middleware
  shared/
    lib/
      config.js                  # (was src/lib/config.js)
      db.js                      # (was src/lib/db.js) + getCredential/upsertCredential
      email.js                   # (was src/lib/email.js)
      rate-limit.js              # (was src/lib/rate-limit.js)
      response.js                # (was src/lib/response.js)
      templates.js               # (was src/lib/templates.js)
  templates/                     # Unchanged — all .hbs files stay here
```

### Requirements Table

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | Directory reorganization | `git mv` all existing files to new locations. Update all import paths in source and test files. Update `wrangler.toml`/`wrangler.test.toml` to `main = "src/api/worker.js"`. Standalone commit, no behavior changes. |
| 2 | Admin Worker deployment | `src/admin/worker.js` entry point, `wrangler.admin.toml` config. `setup.sh` seeds credentials into D1 and deploys both Workers. `isAuthorized()` in API Worker reads admin API key from D1 with env var fallback. |
| 3 | Auth database schema | Migration `0006_admin_auth.sql`: `admin_sessions`, `magic_link_tokens`, `credentials` tables. |
| 4 | Login page | `GET /admin/login` → `admin-login.hbs`. Already-authenticated redirects to `/admin`. Form POSTs to `/admin/login`. |
| 5 | Magic link request | `POST /admin/login` — case-insensitive email match → token + email. Always shows "check your email" page. |
| 6 | Magic link email delivery | `sendEmail()` from `src/shared/lib/email.js`, Resend key from D1. From: `admin@{DOMAIN}`. Template: `admin-magic-link.hbs`. |
| 7 | Magic link verification | `GET /admin/verify?token=` — validate, mark used, create session, set cookie, redirect to `/admin`. |
| 8 | Session management | Cookie `feedmail_admin_session`, HttpOnly/Secure/SameSite=Strict, Path=/admin, 24hr TTL. D1-backed. Logout clears both. |
| 9 | Rate limiting | `admin_login` (10/hr) and `admin_verify` (10/hr) added to `RATE_LIMIT_DEFAULTS`. Reuses existing `checkRateLimit()`. |
| 10 | Protected route middleware | `requireSession()` on all `/admin/*` except login/verify/logout. Redirect with `?redirect=` param, validated to start with `/admin`. |

### New Files

| File | Purpose |
|------|---------|
| `src/admin/worker.js` | Admin Worker entry point |
| `src/admin/routes/auth.js` | Login, verify, logout handlers |
| `src/admin/lib/db.js` | Session + magic link token D1 helpers |
| `src/admin/lib/session.js` | Cookie parsing, `requireSession()` middleware |
| `src/templates/admin-login.hbs` | Login page |
| `src/templates/admin-login-sent.hbs` | "Check your email" confirmation |
| `src/templates/admin-auth-error.hbs` | Verification error page |
| `src/templates/admin-magic-link.hbs` | Magic link HTML email |
| `src/templates/admin-placeholder.hbs` | Placeholder dashboard |
| `migrations/0006_admin_auth.sql` | Schema migration |
| `wrangler.admin.toml` | Admin Worker config template |

### Modified Files

| File | Change |
|------|--------|
| All existing `src/` files | Move to `api/` or `shared/` subdirs, update import paths |
| All existing `tests/` files | Move to mirror source structure, update import/mock paths |
| `wrangler.toml` | `main = "src/api/worker.js"` |
| `wrangler.test.toml` | `main = "src/api/worker.js"` |
| `src/shared/lib/config.js` | Add `admin_login`, `admin_verify` to `RATE_LIMIT_DEFAULTS` |
| `src/shared/lib/rate-limit.js` | Add endpoint mappings for admin paths |
| `src/shared/lib/templates.js` | Register 5 new admin templates |
| `src/shared/lib/db.js` | Add `getCredential()`, `upsertCredential()` |
| `src/api/worker.js` | `isAuthorized()` → async, reads admin API key from D1 |
| `src/api/routes/send.js` | Read Resend key from D1 with fallback |
| `src/api/routes/subscribe.js` | Read Resend key from D1 with fallback |
| `scripts/setup.sh` | Seed credentials, gen admin config, deploy both Workers |
| `package.json` | Add `deploy:admin`, `dev:admin`, `build:check:admin` scripts |
| `.gitignore` | Add `wrangler.admin.prod.toml` |

### Naming Conventions

| Name | Location | Description |
|------|----------|-------------|
| `getCredential(db, key)` | `src/shared/lib/db.js` | Read credential from D1. Returns string or null. |
| `upsertCredential(db, key, value)` | `src/shared/lib/db.js` | Insert or update credential. |
| `createMagicLinkToken(db, token, expiresAt)` | `src/admin/lib/db.js` | Insert magic link token row. |
| `getMagicLinkToken(db, token)` | `src/admin/lib/db.js` | Look up magic link token. |
| `markMagicLinkTokenUsed(db, token)` | `src/admin/lib/db.js` | Set `used = 1` on token. |
| `createSession(db, token, expiresAt)` | `src/admin/lib/db.js` | Insert session row. |
| `getSession(db, token)` | `src/admin/lib/db.js` | Look up session by token. |
| `deleteSession(db, token)` | `src/admin/lib/db.js` | Delete session row. |
| `requireSession(request, env)` | `src/admin/lib/session.js` | Middleware: returns `{ session }` or redirect Response. |
| `getSessionFromCookie(request)` | `src/admin/lib/session.js` | Parse cookie value. Returns string or null. |
| `SESSION_COOKIE_NAME` | `src/admin/lib/session.js` | `"feedmail_admin_session"` |
| `SESSION_TTL_SECONDS` | `src/admin/lib/session.js` | `86400` (24 hours) |
| `MAGIC_LINK_TTL_SECONDS` | `src/admin/lib/db.js` | `900` (15 minutes) |

### Credential Keys (in `credentials` table)

| Key | Description |
|-----|-------------|
| `admin_email` | Admin user's email address |
| `resend_api_key` | Resend API key |
| `admin_api_key` | Admin API key for API Worker auth |

### Template Registration Names (in `src/shared/lib/templates.js`)

| File | Registration Name |
|------|-------------------|
| `admin-login.hbs` | `adminLogin` |
| `admin-login-sent.hbs` | `adminLoginSent` |
| `admin-auth-error.hbs` | `adminAuthError` |
| `admin-magic-link.hbs` | `adminMagicLink` |
| `admin-placeholder.hbs` | `adminPlaceholder` |

### Out of Scope

- Passkey authentication — separate future feature
- Visual styling of auth pages — deferred to Admin Console UI
- Manual code entry fallback — additive enhancement
- Multi-user admin — single admin only
- Password/SSO auth — not part of auth model
- Extended session duration — 24hr TTL fixed
- API key management UI — deferred to Admin Console Enhancements
- Splitting `src/shared/lib/db.js` — all D1 helpers co-located for simplicity
- Moving templates into Worker-specific subdirs — precompiler scans single directory
