# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm run dev              # Local dev server — API Worker (wrangler dev) on port 8787
pnpm run dev:admin        # Local dev server — Admin Worker (wrangler.admin.toml)
pnpm run dev:test         # Local dev with test channel config (wrangler.test.toml)
pnpm run dev:feed         # Serve test feed fixtures on port 8888
pnpm run deploy           # Deploy API Worker to Cloudflare (uses wrangler.prod.toml)
pnpm run deploy:admin     # Deploy Admin Worker to Cloudflare (uses wrangler.admin.prod.toml)
pnpm run upgrade          # Upgrade deployment: install deps, migrate, deploy both workers
pnpm run db:migrate       # Apply D1 migrations (remote, uses wrangler.prod.toml)
pnpm run db:migrate:local # Apply D1 migrations (local dev)
pnpm run db:reset:local   # Clear all local D1 tables
pnpm run test             # Run all tests (vitest)
pnpm run test:coverage    # Run tests with coverage report
pnpm run build:check      # Dry-run deploy API Worker to verify build
pnpm run build:check:admin # Dry-run deploy Admin Worker to verify build
pnpm run lint             # Run ESLint
pnpm run lint:fix         # Run ESLint with auto-fix
pnpm run format           # Format all files with Prettier
pnpm run format:check     # Check formatting without writing
```

## Architecture

feedmail is an RSS-to-email microservice on Cloudflare Workers. It monitors RSS/Atom feeds for new items and emails them to verified subscribers via Resend. Licensed AGPL-3.0.

### Runtime Stack

- **Cloudflare Workers** — HTTP request handling and cron triggers
- **Cloudflare D1** (SQLite) — Subscribers, verification attempts, sent item history, rate limits, site/channel/feed configuration
- **Resend API** — Transactional email delivery

### Directory Structure

```
src/
  api/                    # API Worker (handles /api/* routes)
    worker.js             # Main router: fetch handler + scheduled (cron) handler
    routes/
      subscribe.js        # POST /api/subscribe — strict input validation + rate-limited verification emails
      verify.js           # GET /api/verify — 24hr token expiry, marks subscriber verified
      unsubscribe.js      # GET + POST /api/unsubscribe — RFC 8058 one-click support
      send.js             # POST /api/send + checkFeedsAndSend() — feed processing + email dispatch
      admin.js            # Admin API router — delegates to sub-handlers
      admin-config.js     # GET/PATCH /api/admin/config — site settings + rate limits
      admin-channels.js   # CRUD /api/admin/channels — channel management
      admin-feeds.js      # CRUD /api/admin/channels/{id}/feeds — feed management
    lib/
      cors.js             # CORS preflight + response header helpers
      feed-parser.js      # RSS 2.0 + Atom parsing via fast-xml-parser, normalized item shape
      html-to-text.js     # HTML processing: plain text fallback + image constraining
  admin/                  # Admin Worker (handles /admin/* routes)
    worker.js             # Admin fetch handler: routing, rate limiting, session middleware
    routes/
      auth.js             # Login, magic link verification, logout handlers
      channels.js         # Channel CRUD: list, new, create, detail, update, delete + parseFeedRows() + inline feed diffing + HTMX fragment responses
      dashboard.js        # Dashboard with per-channel stats, send trigger + HTMX feedback
      passkeys.js         # WebAuthn passkey registration, authentication, management + HTMX fragment responses
      settings.js         # Settings page (passkey management with bootstrap prompt)
      subscribers.js      # Subscriber list with channel/status filtering + HTMX table updates
    lib/
      api.js              # API client helper: callApi(env, method, path, body?) + API_UNREACHABLE_ERROR constant
      db.js               # Admin D1 helpers (magic link tokens, sessions, passkey credentials, WebAuthn challenges)
      htmx.js             # HTMX helpers: isHtmxRequest(request), fragmentResponse(html, status?, headers?)
      session.js          # Session middleware, cookie/session helpers, getCookieValue utility, HTMX-aware session expiry
  shared/                 # Shared modules used by both Workers
    lib/
      config.js           # DB-backed config reads, validation helpers (validateChannelId, validateChannelFields, validateFeedFields), rate limit defaults
      db.js               # All D1 query helpers (subscribers, config, channels, feeds, credentials)
      email.js            # Resend API email sending wrapper
      rate-limit.js       # IP-based rate limiting: config, rolling window check, endpoint name mapping
      response.js         # Shared HTTP response helpers (jsonResponse, htmlResponse, rateLimitResponse)
      templates.js        # Handlebars precompiled template rendering — render(name, data)
  templates/              # Handlebars (.hbs) source files, precompiled at build time
    partials/
      admin-head.hbs      # Shared <head> partial for all admin console pages (links to external CSS)
      admin-nav.hbs       # Navigation bar partial with activePage highlighting
      admin-layout.hbs    # Authenticated page layout: sidebar nav, HTMX script, content via {{> @partial-block}}
      admin-auth-layout.hbs  # Auth page layout: centered, no sidebar, no HTMX
      admin-channel-form-body.hbs  # Shared channel form body partial (used by full-page and fragment templates)
      email-footer.hbs    # Shared email footer partial (copyright, unsubscribe, company info)
      webauthn-helpers.hbs  # Shared base64url conversion functions for WebAuthn inline JS
    newsletter.hbs        # HTML newsletter email (table-based, inline styles)
    newsletter.txt.hbs    # Plain text newsletter
    verification-email.hbs  # Verification CTA email
    verify-page.hbs       # "You're subscribed" confirmation page
    unsubscribe-page.hbs  # "You've been unsubscribed" page
    error-page.hbs        # Error page (invalid/expired tokens)
    admin-login.hbs       # Admin login form (uses admin-auth-layout)
    admin-login-sent.hbs  # "Check your email" confirmation (uses admin-auth-layout)
    admin-auth-error.hbs  # Auth error page (uses admin-auth-layout)
    admin-magic-link.hbs  # Magic link email body
    admin-dashboard.hbs   # Dashboard with per-channel stats and passkey bootstrap prompt
    admin-channels.hbs    # Channel list page
    admin-channel-form.hbs # Unified channel create/edit form with inline feed management, slug validation, CORS auto-populate, helper text
    admin-channel-form-result.hbs  # HTMX fragment: channel form result after save (success/error + form)
    admin-subscribers.hbs # Subscriber table with channel/status filter dropdowns
    admin-subscriber-table.hbs  # HTMX fragment + partial: subscriber table rows (used inline and as partial)
    admin-settings.hbs    # Settings page with passkey management
    admin-send-feedback.hbs  # HTMX fragment: send trigger feedback (success/error)
    admin-passkey-list.hbs  # HTMX fragment: passkey list after rename/delete
    admin-session-expired.hbs  # HTMX fragment: session expired message with login link
    admin-delete-confirm.hbs  # HTMX fragment: generic delete confirmation dialog
assets/
  admin/
    styles.css            # CUBE CSS design system: tokens, dark mode, reset, compositions, utilities, blocks, exceptions
    htmx.min.js           # HTMX 2.0.4 — committed as-is, no build pipeline
migrations/
  0001_initial.sql        # D1 schema: subscribers, verification_attempts, sent_items
  0002_subscriber_sends.sql  # Per-subscriber send tracking for partial send recovery
  0003_rate_limits.sql    # IP-based rate limiting table
  0004_rename_site_id_to_channel_id.sql  # Rename site_id → channel_id in subscribers
  0005_config_tables.sql  # DB-backed config: site_config, rate_limit_config, channels, feeds
  0006_admin_auth.sql     # Admin auth: credentials, magic_link_tokens, admin_sessions tables
  0007_passkey_credentials.sql  # WebAuthn passkey credentials and challenge storage
wrangler.toml             # API Worker config template with placeholders
wrangler.admin.toml       # Admin Worker config template with placeholders
wrangler.prod.toml        # API Worker deployer-specific config (gitignored)
wrangler.admin.prod.toml  # Admin Worker deployer-specific config (gitignored)
wrangler.test.toml        # Local testing config — test channel with localhost feeds
tests/
  helpers/
    mock-db.js            # Shared D1 mock helper for unit tests
  fixtures/
    feed.rss              # RSS 2.0 test feed fixture (served by dev:feed)
    feed.atom             # Atom test feed fixture (served by dev:feed)
scripts/
  install.sh              # Curl-installable bootstrap: prereq checks, clone, pnpm install, hand off to setup
  setup.sh                # Interactive setup wizard: D1 creation, wrangler.prod.toml, secrets, deploy, first channel
  precompile-templates.mjs  # Build-time Handlebars template compiler
  test-local.sh           # Interactive local testing helper (subscribe → verify → send)
```

### Local Testing

`wrangler.test.toml` provides a separate config for local testing with a test channel that has all optional fields populated (companyName, companyAddress, replyTo) and feeds pointing to local fixtures. This avoids putting test config in production.

To test the full email flow locally:

1. `pnpm run dev:feed` — serves RSS and Atom fixtures on port 8888
2. `pnpm run dev:test` — starts wrangler with the test config on port 8787
3. `./scripts/test-local.sh <your-email>` — walks through subscribe → verify → send

### Key Design Decisions

- **Two-worker architecture:** The API Worker (`src/api/worker.js`) handles `/api/*` routes and cron triggers. The Admin Worker (`src/admin/worker.js`) handles `/admin/*` routes for the browser-based admin console. Both share the same D1 database and shared modules in `src/shared/`. Each Worker has its own wrangler config (`wrangler.toml` / `wrangler.admin.toml`).
- **Admin console as API proxy:** The Admin Worker renders server-side HTML and acts as a proxy to the API Worker. All data operations go through `callApi()` in `src/admin/lib/api.js`, which reads `admin_api_key` from D1 and makes authenticated requests to the API Worker via a Cloudflare Service Binding (`env.API_SERVICE`). The service binding sends requests directly to the API Worker without going through public HTTP/edge routing, avoiding subrequest loop issues inherent in same-zone worker-to-worker `fetch()` calls. Route handlers parse form data, call the API, and either render a full page or return an HTMX fragment response (detected via `isHtmxRequest()` checking the `HX-Request` header). Templates use `isEdit` boolean to toggle between create and edit modes. The channel form is a unified page combining channel config and inline feed management — on create, at least one feed is required; on edit, the handler diffs submitted feeds against current server state and issues individual create/update/delete API calls. Noscript fallback actions (`add-feed`, `remove-feed`) allow feed row management without JavaScript.
- **HTMX integration:** HTMX 2.0.4 is served as a static asset (`assets/admin/htmx.min.js`) via Cloudflare Workers static assets (`[assets]` config in `wrangler.admin.toml`). Route handlers detect HTMX requests via the `HX-Request: true` header and return HTML fragments instead of full-page redirects. Fragment templates (e.g. `admin-channel-form-result.hbs`, `admin-subscriber-table.hbs`) are rendered into `hx-target` containers. Session expiry during HTMX requests returns a session-expired fragment instead of a redirect. `isHtmxRequest()` uses strict `=== "true"` comparison.
- **CUBE CSS design system:** Admin console styling uses CUBE CSS methodology (Compositions, Utilities, Blocks, Exceptions) with Every Layout primitives. CSS is a single external file (`assets/admin/styles.css`) served as a static asset — no build pipeline or minification. Design tokens use Utopia fluid `clamp()` values for responsive typography and spacing. Dark mode via `prefers-color-scheme`. Layout partials (`admin-layout.hbs` for authenticated pages with sidebar nav, `admin-auth-layout.hbs` for centered auth pages) use Handlebars partial blocks (`{{> @partial-block}}`).
- **Admin console static assets:** The Admin Worker serves static files from the `assets/` directory via Cloudflare Workers static assets (`[assets]` config in `wrangler.admin.toml`). Currently contains `admin/styles.css` and `admin/htmx.min.js`. The `assets/` directory is excluded from ESLint.
- **Admin authentication:** Passkey (WebAuthn) authentication as primary login method, with magic link email as fallback. Uses `@simplewebauthn/server` for server-side WebAuthn operations; client-side ceremony code is inline JS (no `@simplewebauthn/browser`). A single admin email is stored in the `credentials` table. Passkey credentials are stored in `passkey_credentials` with public keys as base64url TEXT. WebAuthn challenges are stored in `webauthn_challenges` (Workers are stateless — no in-memory storage). Login page shows passkey button when credentials exist, with magic link form always available. Session cookie is `HttpOnly; Secure; SameSite=Strict; Path=/admin`. Magic link tokens expire after 15 minutes; WebAuthn challenges expire after 5 minutes; sessions expire after 24 hours. Single admin user model — fixed UUID for WebAuthn user ID. Dashboard shows a passkey bootstrap prompt when no passkeys are registered.
- **Credentials in D1:** Secrets (`resend_api_key`, `admin_api_key`, `admin_email`) are stored in the `credentials` table. The shared `getResendApiKey(env)` helper checks `env.RESEND_API_KEY` first (backward compat) then falls back to D1. The Admin Worker has no Wrangler secrets — it reads all credentials from D1.
- **DB-backed configuration:** Channel, feed, site settings, and rate limit config are stored in D1 tables (not env vars). Config is read asynchronously via `config.js` helpers that accept the `env` object. Admin API endpoints provide runtime CRUD management without redeployment. `RATE_LIMIT_DEFAULTS` in `config.js` provides hardcoded fallbacks when no DB rows exist.
- **Multi-channel support:** Each channel has its own subscriber list, feeds, sender identity, and CORS origins. All routes accept a `channelId` parameter to scope operations. A single deployment is the site; channels are subscriber lists with feeds.
- **DOMAIN-based URL/email construction:** The `DOMAIN` env var (e.g. `feedmail.cc`) is used to construct all URLs as `https://{DOMAIN}/api/...` and from-email addresses as `{fromUser}@{DOMAIN}`. HTTPS is always assumed. This is the only config that remains as an env var.
- **Config validation:** `validateChannelId()`, `validateChannelFields()`, and `validateFeedFields()` in `config.js` throw errors on invalid data. Channel IDs must be valid slugs (lowercase alphanumeric + hyphens, no leading/trailing/consecutive hyphens). Used by both the channel/feed read path and admin write endpoints. `getChannels()` validates DOMAIN format on every call.
- **Structured feeds:** Each feed is an object with `name`, `url`, and integer `id` (auto-increment PK for stable REST URLs).
- **No info leakage:** Subscribe endpoint always returns the same success response regardless of whether email is new, already subscribed, rate-limited, or unsubscribed. Verify endpoint shows the same error for invalid and expired tokens.
- **Verification rate limiting:** `verification_attempts` table tracks emails sent per subscriber. Rolling window (default 24h) with max attempts (default 3). Configurable at runtime via admin config API.
- **IP-based rate limiting:** `rate_limits` table tracks requests per IP per endpoint using a rolling window. Default limits per endpoint (subscribe: 10/hr, verify: 20/hr, unsubscribe: 20/hr, send: 5/hr, admin: 30/hr, admin_login: 10/hr, admin_verify: 10/hr) stored as `RATE_LIMIT_DEFAULTS` in `config.js`, overridable via `rate_limit_config` DB table and admin config API. Rate limiting runs before authentication to protect against brute-force API key guessing. `Retry-After` header uses oldest-request-expiry strategy with 0–30s random jitter to prevent thundering herd retries. Expired rows for the specific IP+endpoint are cleaned up on every check; rows older than 7 days (from IPs that stopped visiting) are pruned probabilistically — 1% chance per check — via a fire-and-forget global DELETE, distributing cleanup load across normal traffic without blocking request handling. **Internal admin requests** (via the Service Binding) are identified by an `X-Internal-Request: true` header set by `callApi()`. For `/api/admin/*` routes, rate limiting is deferred until after auth: authenticated internal requests skip rate limiting entirely; failed-auth internal requests are rate-limited retroactively. Non-admin routes ignore the header. The shared `rateLimitResponse()` helper in `response.js` constructs 429 responses for both workers.
- **Strict HTTP method enforcement:** `ROUTE_METHODS` in `worker.js` explicitly lists every route and its allowed methods. Known routes with wrong methods receive a deliberate 10-second delay then 408 timeout (discourages bot probing). Unknown paths get an immediate 404 with no body.
- **Strict input validation:** Subscribe endpoint rejects requests with any fields beyond `email` and `channelId` (same error as malformed JSON — no info leak). This enables invisible honeypot fields in the subscribe form.
- **Feed bootstrapping:** First time a feed URL is seen, all existing items are inserted into `sent_items` with `recipient_count = 0` — prevents blasting historical content on first deployment.
- **Per-subscriber sends:** Each subscriber gets an individual email with personalized `List-Unsubscribe` headers. Template uses `%%UNSUBSCRIBE_URL%%` placeholder replaced per-subscriber before sending. The `subscriber_sends` table tracks delivery per-subscriber so partial sends (from quota exhaustion) can resume on the next cron run without duplicates.
- **Resend rate limit handling:** The email module retries 429 responses up to 3 times, respecting the `retry-after` header (capped at 60s). If quota is exhausted, the send loop halts and the item is left unmarked in `sent_items` so the next run retries remaining subscribers.
- **Handlebars templates** are precompiled at build time (`scripts/precompile-templates.mjs`) because Cloudflare Workers disallow `new Function()`. The runtime uses `Handlebars.template()` with precompiled specs. Partials live in `src/templates/partials/` and are registered both at precompile time (so templates can reference them) and at runtime (via `Handlebars.registerPartial`). Some fragment templates (e.g. `admin-subscriber-table`) are registered as both templates and partials so they can be rendered standalone (for HTMX responses) or included in full-page templates. Custom helpers: `formatDate`, `currentYear`, `eq` (strict equality), `iif` (inline ternary: `{{iif condition trueVal falseVal}}`).
- **User-Agent** uses semver from `package.json` (imported with `{ type: "json" }`).
- **Zero tracking:** No open pixels or click tracking.

### D1 Schema (12 tables)

**Subscriber & delivery tables:**

- `subscribers` — email, channel_id, status (pending/verified/unsubscribed), verify_token, unsubscribe_token. UNIQUE(email, channel_id).
- `verification_attempts` — subscriber_id, sent_at. Used for rolling window rate limiting.
- `sent_items` — item_id, feed_url, title, recipient_count. UNIQUE(item_id, feed_url). Tracks both seeded (bootstrapped) and actually-sent items. Only inserted when all subscribers have been reached.
- `subscriber_sends` — subscriber_id, item_id, feed_url. UNIQUE(subscriber_id, item_id, feed_url). Per-subscriber deduplication so partial sends (interrupted by quota exhaustion) can resume without re-sending.
- `rate_limits` — ip, endpoint, requested_at. Indexed on (ip, endpoint, requested_at) for efficient rolling window queries. Expired rows are cleaned up on each check.

**Configuration tables (migration 0005):**

- `site_config` — key, value. Stores site-level settings (verify_max_attempts, verify_window_hours).
- `rate_limit_config` — endpoint (PK), max_requests, window_hours. Per-endpoint rate limit overrides.
- `channels` — id (PK), site_name, site_url, from_user, from_name, reply_to, company_name, company_address, cors_origins (JSON array). DB uses snake_case; `db.js` helpers convert to camelCase.
- `feeds` — id (auto-increment PK), channel_id (FK), name, url. UNIQUE(channel_id, url), UNIQUE(channel_id, name).

**Admin auth tables (migration 0006):**

- `credentials` — key (PK), value. Stores admin_email, resend_api_key, admin_api_key.
- `magic_link_tokens` — token (UNIQUE), expires_at, used (0/1), created_at. Short-lived tokens for passwordless login.
- `admin_sessions` — token (UNIQUE), expires_at, created_at. Server-side session storage.

**Passkey tables (migration 0007):**

- `passkey_credentials` — credential_id (PK, base64url TEXT), public_key (base64url TEXT), counter (INTEGER), transports (JSON TEXT), name (TEXT, nullable), created_at.
- `webauthn_challenges` — id (auto-increment PK), session_token, type, challenge (TEXT), expires_at. Temporary challenge storage for WebAuthn ceremonies.

### API Routes

**Public (CORS-enabled for configured origins):**

- `POST /api/subscribe` — `{email, channelId}` (only these two fields accepted; extra fields are rejected)
- `GET /api/verify?token=` — Returns HTML page
- `GET|POST /api/unsubscribe?token=` — GET returns HTML, POST is RFC 8058 one-click

**Authenticated (Bearer token via `ADMIN_API_KEY`):**

- `POST /api/send` — Manual feed check + send, optional `{channelId}` filter
- `GET /api/admin/stats?channelId=` — Subscriber counts + sent item stats
- `GET /api/admin/subscribers?channelId=&status=` — Subscriber list with optional status filter
- `GET|PATCH /api/admin/config` — Site settings (verify limits, rate limits)
- `GET|POST /api/admin/channels` — List/create channels
- `GET|PUT|DELETE /api/admin/channels/{id}` — Get/update/delete channel
- `GET|POST /api/admin/channels/{id}/feeds` — List/add feeds
- `PUT|DELETE /api/admin/channels/{id}/feeds/{feedId}` — Update/delete feed

**Admin Console (browser-based, same-origin only — no CORS):**

- `GET /admin/login` — Login form with passkey button (if registered) and magic link form
- `POST /admin/login` — Request magic link email
- `GET /admin/verify?token=` — Validate magic link, create session, redirect
- `GET /admin/logout` — Destroy session, redirect to login
- `GET /admin` — Dashboard with per-channel subscriber/send stats (requires session)
- `POST /admin/send` — Trigger feed check and send, optional channelId (requires session)
- `GET /admin/channels` — Channel list (requires session)
- `GET /admin/channels/new` — Channel creation form (requires session)
- `POST /admin/channels` — Create a new channel (requires session)
- `GET /admin/channels/{id}` — Channel detail/edit form with feed list (requires session)
- `POST /admin/channels/{id}` — Update a channel (requires session)
- `POST /admin/channels/{id}/delete` — Delete a channel (requires session)
- `GET /admin/channels/{id}/delete/confirm` — HTMX fragment: delete confirmation dialog for a channel (requires session)
- `GET /admin/subscribers` — Subscriber list with channel/status filtering (requires session)
- `GET /admin/settings` — Settings page with passkey management (requires session)
- `GET /admin/passkeys` — Redirects to /admin/settings (requires session)
- `POST /admin/passkeys/register/options` — Generate WebAuthn registration options (requires session)
- `POST /admin/passkeys/register/verify` — Verify registration and store credential (requires session)
- `POST /admin/passkeys/authenticate/options` — Generate WebAuthn authentication options (public, rate-limited)
- `POST /admin/passkeys/authenticate/verify` — Verify authentication and create session (public, rate-limited)
- `POST /admin/passkeys/{id}/rename` — Rename a passkey credential (requires session)
- `POST /admin/passkeys/{id}/delete` — Delete a passkey credential (requires session)
- `GET /admin/passkeys/{id}/delete/confirm` — HTMX fragment: delete confirmation dialog for a passkey (requires session)

### Security Layers

Requests pass through these checks in order:

1. **Trailing-slash normalization** — Strips trailing slashes before any processing (Admin Worker: 301 redirect for GET, silent strip for non-GET; API Worker: silent strip for all methods)
2. **CORS preflight** — OPTIONS requests handled immediately
3. **Method enforcement** — Wrong method on known route → 10s delay + 408; unknown path → immediate 404
4. **IP rate limiting** — Per-endpoint rolling window via D1; 429 with `Retry-After` header if exceeded. Internal admin requests (with `X-Internal-Request: true` header) defer rate limiting to after auth — skipped on success, applied retroactively on failure.
5. **Authentication** — Bearer token check for `/api/send` and `/api/admin/*`
6. **Input validation** — Strict field checking on subscribe (rejects unexpected fields)
7. **Verification rate limiting** — Per-subscriber email send limits

### Configuration

**`wrangler.toml`** (API Worker) and **`wrangler.admin.toml`** (Admin Worker) are templates with placeholder values (`YOUR_DOMAIN`, `YOUR_DATABASE_ID`, `YOUR_API_WORKER_NAME`). The setup wizard generates `wrangler.prod.toml` and `wrangler.admin.prod.toml` with real values. Both prod configs are gitignored. `build:check` and `build:check:admin` use the template configs (dry-run works with placeholders). The Admin Worker uses a Cloudflare Service Binding (`API_SERVICE`) to call the API Worker directly, avoiding same-zone subrequest routing issues.

**`wrangler.toml` / `wrangler.prod.toml` vars:**

- `DOMAIN` — Domain name of the service (e.g. `feedmail.cc`). Used to construct all URLs as `https://{DOMAIN}/api/...` and from-email as `{fromUser}@{DOMAIN}`. Must not include protocol, trailing slash, or path segments. This is the only config that remains as an env var.

**D1 database (managed via admin API):**

- **Channels** — id, siteName, siteUrl, fromUser, fromName, replyTo, companyName, companyAddress, corsOrigins
- **Feeds** — name, url (per channel, with auto-increment integer PK)
- **Site config** — verify_max_attempts (default 3), verify_window_hours (default 24)
- **Rate limits** — Per-endpoint max_requests and window_hours overrides

**Secrets (API Worker — set via `wrangler secret put`):**

- `RESEND_API_KEY` — also stored in D1 `credentials` table; env var takes precedence
- `ADMIN_API_KEY` — also stored in D1 `credentials` table; env var takes precedence

The Admin Worker has no Wrangler secrets — it reads `admin_email` and `resend_api_key` from the D1 `credentials` table.

**Local dev secrets** go in `.dev.vars` (gitignored):

```
RESEND_API_KEY=re_xxxxxxxxx
ADMIN_API_KEY=any-test-value
```

### Cron Trigger

Configured in `wrangler.toml` as `0 */6 * * *` (every 6 hours). Calls `checkFeedsAndSend(env)` which iterates all channels and feeds.

### Route Configuration

Three Workers share the zone via pattern-based routing:

- **API Worker** (`feedmail`) — `{DOMAIN}/api/*` — handles API traffic and cron triggers
- **Admin Worker** (`feedmail-admin`) — `{DOMAIN}/admin*` — handles admin console (pattern uses `admin*` not `admin/*` so bare `/admin` is caught)
- **Website Worker** (separate repo) — handles all other traffic on the domain

### Trailing Slash Normalization

Both workers normalize trailing slashes early in the request pipeline, before rate limiting, authentication, or route matching:

- **Admin Worker:** GET requests with trailing slashes receive a 301 redirect to the canonical URL (query strings preserved). Non-GET requests have trailing slashes silently stripped.
- **API Worker:** All methods have trailing slashes silently stripped (no redirects — API clients don't benefit from URL bar updates).

Multiple trailing slashes (e.g. `/api/subscribe//`) are handled. Bare `/` is never affected.
