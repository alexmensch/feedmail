# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm run dev              # Local dev server (wrangler dev) on port 8787
pnpm run dev:test         # Local dev with test channel config (wrangler.test.toml)
pnpm run dev:feed         # Serve test feed fixtures on port 8888
pnpm run deploy           # Deploy to Cloudflare Workers
pnpm run db:migrate       # Apply D1 migrations (remote/production)
pnpm run db:migrate:local # Apply D1 migrations (local dev)
pnpm run db:reset:local   # Clear all local D1 tables
pnpm run test             # Run all tests (vitest)
pnpm run test:coverage    # Run tests with coverage report
pnpm run build:check      # Dry-run deploy to verify build (no actual deploy)
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
  index.js              # Main router: fetch handler + scheduled (cron) handler
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
    config.js           # DB-backed config reads, validation helpers, rate limit defaults
    cors.js             # CORS preflight + response header helpers
    db.js               # All D1 query helpers (subscribers, config, channels, feeds, etc.)
    response.js         # Shared HTTP response helpers (jsonResponse)
    feed-parser.js      # RSS 2.0 + Atom parsing via fast-xml-parser, normalized item shape
    html-to-text.js     # HTML processing: plain text fallback + image constraining
    email.js            # Resend API email sending wrapper
    rate-limit.js       # IP-based rate limiting: config, rolling window check, endpoint name mapping
    templates.js        # Handlebars precompiled template rendering — render(name, data)
  templates/            # Handlebars (.hbs) source files, precompiled at build time
    partials/
      email-footer.hbs  # Shared email footer partial (copyright, unsubscribe, company info)
    newsletter.hbs      # HTML newsletter email (table-based, inline styles)
    newsletter.txt.hbs  # Plain text newsletter
    verification-email.hbs  # Verification CTA email
    verify-page.hbs     # "You're subscribed" confirmation page
    unsubscribe-page.hbs    # "You've been unsubscribed" page
    error-page.hbs      # Error page (invalid/expired tokens)
migrations/
  0001_initial.sql      # D1 schema: subscribers, verification_attempts, sent_items
  0002_subscriber_sends.sql  # Per-subscriber send tracking for partial send recovery
  0003_rate_limits.sql  # IP-based rate limiting table
  0004_rename_site_id_to_channel_id.sql  # Rename site_id → channel_id in subscribers
  0005_config_tables.sql  # DB-backed config: site_config, rate_limit_config, channels, feeds
wrangler.toml           # Worker config, cron, D1 binding, DOMAIN env var, route pattern
wrangler.test.toml      # Local testing config — test channel with localhost feeds
tests/
  fixtures/
    feed.rss            # RSS 2.0 test feed fixture (served by dev:feed)
    feed.atom           # Atom test feed fixture (served by dev:feed)
scripts/
  precompile-templates.mjs  # Build-time Handlebars template compiler
  migrate-env-to-db.mjs     # One-time migration: env var config → D1 tables
  test-local.sh         # Interactive local testing helper (subscribe → verify → send)
```

### Local Testing

`wrangler.test.toml` provides a separate config for local testing with a test channel that has all optional fields populated (companyName, companyAddress, replyTo) and feeds pointing to local fixtures. This avoids putting test config in production.

To test the full email flow locally:
1. `pnpm run dev:feed` — serves RSS and Atom fixtures on port 8888
2. `pnpm run dev:test` — starts wrangler with the test config on port 8787
3. `./scripts/test-local.sh <your-email>` — walks through subscribe → verify → send

### Key Design Decisions

- **DB-backed configuration:** Channel, feed, site settings, and rate limit config are stored in D1 tables (not env vars). Config is read asynchronously via `config.js` helpers that accept the `env` object. Admin API endpoints provide runtime CRUD management without redeployment. `RATE_LIMIT_DEFAULTS` in `config.js` provides hardcoded fallbacks when no DB rows exist.
- **Multi-channel support:** Each channel has its own subscriber list, feeds, sender identity, and CORS origins. All routes accept a `channelId` parameter to scope operations. A single deployment is the site; channels are subscriber lists with feeds.
- **DOMAIN-based URL/email construction:** The `DOMAIN` env var (e.g. `feedmail.cc`) is used to construct all URLs as `https://{DOMAIN}/api/...` and from-email addresses as `{fromUser}@{DOMAIN}`. HTTPS is always assumed. This is the only config that remains as an env var.
- **Config validation:** `validateChannelFields()` and `validateFeedFields()` in `config.js` throw errors on invalid data. Used by both the channel/feed read path and admin write endpoints. `getChannels()` validates DOMAIN format on every call.
- **Structured feeds:** Each feed is an object with `name`, `url`, and integer `id` (auto-increment PK for stable REST URLs).
- **No info leakage:** Subscribe endpoint always returns the same success response regardless of whether email is new, already subscribed, rate-limited, or unsubscribed. Verify endpoint shows the same error for invalid and expired tokens.
- **Verification rate limiting:** `verification_attempts` table tracks emails sent per subscriber. Rolling window (default 24h) with max attempts (default 3). Configurable at runtime via admin config API.
- **IP-based rate limiting:** `rate_limits` table tracks requests per IP per endpoint using a rolling window. Default limits per endpoint (subscribe: 10/hr, verify: 20/hr, unsubscribe: 20/hr, send: 5/hr, admin: 30/hr) stored as `RATE_LIMIT_DEFAULTS` in `config.js`, overridable via `rate_limit_config` DB table and admin config API. Rate limiting runs before authentication to protect against brute-force API key guessing. `Retry-After` header uses oldest-request-expiry strategy with 0–30s random jitter to prevent thundering herd retries. Expired rows for the specific IP+endpoint are cleaned up on every check; rows older than 7 days (from IPs that stopped visiting) are pruned probabilistically — 1% chance per check — via a fire-and-forget global DELETE, distributing cleanup load across normal traffic without blocking request handling.
- **Strict HTTP method enforcement:** `ROUTE_METHODS` in `index.js` explicitly lists every route and its allowed methods. Known routes with wrong methods receive a deliberate 10-second delay then 408 timeout (discourages bot probing). Unknown paths get an immediate 404 with no body.
- **Strict input validation:** Subscribe endpoint rejects requests with any fields beyond `email` and `channelId` (same error as malformed JSON — no info leak). This enables invisible honeypot fields in the subscribe form.
- **Feed bootstrapping:** First time a feed URL is seen, all existing items are inserted into `sent_items` with `recipient_count = 0` — prevents blasting historical content on first deployment.
- **Per-subscriber sends:** Each subscriber gets an individual email with personalized `List-Unsubscribe` headers. Template uses `%%UNSUBSCRIBE_URL%%` placeholder replaced per-subscriber before sending. The `subscriber_sends` table tracks delivery per-subscriber so partial sends (from quota exhaustion) can resume on the next cron run without duplicates.
- **Resend rate limit handling:** The email module retries 429 responses up to 3 times, respecting the `retry-after` header (capped at 60s). If quota is exhausted, the send loop halts and the item is left unmarked in `sent_items` so the next run retries remaining subscribers.
- **Handlebars templates** are precompiled at build time (`scripts/precompile-templates.mjs`) because Cloudflare Workers disallow `new Function()`. The runtime uses `Handlebars.template()` with precompiled specs. Partials live in `src/templates/partials/` and are registered both at precompile time (so templates can reference them) and at runtime (via `Handlebars.registerPartial`).
- **User-Agent** uses semver from `package.json` (imported with `{ type: "json" }`).
- **Zero tracking:** No open pixels or click tracking.

### D1 Schema (9 tables)

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

### Security Layers

Requests pass through these checks in order:

1. **CORS preflight** — OPTIONS requests handled immediately
2. **Method enforcement** — Wrong method on known route → 10s delay + 408; unknown path → immediate 404
3. **IP rate limiting** — Per-endpoint rolling window via D1; 429 with `Retry-After` header if exceeded
4. **Authentication** — Bearer token check for `/api/send` and `/api/admin/*`
5. **Input validation** — Strict field checking on subscribe (rejects unexpected fields)
6. **Verification rate limiting** — Per-subscriber email send limits

### Configuration

**`wrangler.toml` vars:**
- `DOMAIN` — Domain name of the service (e.g. `feedmail.cc`). Used to construct all URLs as `https://{DOMAIN}/api/...` and from-email as `{fromUser}@{DOMAIN}`. Must not include protocol, trailing slash, or path segments. This is the only config that remains as an env var.

**D1 database (managed via admin API):**
- **Channels** — id, siteName, siteUrl, fromUser, fromName, replyTo, companyName, companyAddress, corsOrigins
- **Feeds** — name, url (per channel, with auto-increment integer PK)
- **Site config** — verify_max_attempts (default 3), verify_window_hours (default 24)
- **Rate limits** — Per-endpoint max_requests and window_hours overrides

**Secrets (set via `wrangler secret put`):**
- `RESEND_API_KEY`
- `ADMIN_API_KEY`

**Local dev secrets** go in `.dev.vars` (gitignored):
```
RESEND_API_KEY=re_xxxxxxxxx
ADMIN_API_KEY=any-test-value
```

### Cron Trigger

Configured in `wrangler.toml` as `0 */6 * * *` (every 6 hours). Calls `checkFeedsAndSend(env)` which iterates all channels and feeds.

### Route Configuration

The feedmail Worker handles only API traffic via the route pattern `feedmail.cc/api/*`. A separate `feedmail-website` Worker handles all other traffic on the domain. Both Workers share the `feedmail.cc` zone via pattern-based routing.
