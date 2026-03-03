# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm run dev              # Local dev server (wrangler dev) on port 8787
pnpm run deploy           # Deploy to Cloudflare Workers
pnpm run db:migrate       # Apply D1 migrations (remote/production)
pnpm run db:migrate:local # Apply D1 migrations (local dev)
pnpm run test             # Run all tests (vitest)
pnpm run test:coverage    # Run tests with coverage report
```

## Architecture

feedmail is an RSS-to-email microservice on Cloudflare Workers. It monitors RSS/Atom feeds for new items and emails them to verified subscribers via Resend. Licensed AGPL-3.0.

### Runtime Stack

- **Cloudflare Workers** — HTTP request handling and cron triggers
- **Cloudflare D1** (SQLite) — Subscribers, verification attempts, sent item history, rate limits
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
    admin.js            # GET /api/admin/stats, /api/admin/subscribers — bearer auth required
  lib/
    config.js           # SITES JSON parsing, site lookup, rate limit config (cached)
    cors.js             # CORS preflight + response header helpers
    db.js               # All D1 query helpers (subscribers, verification_attempts, sent_items)
    feed-parser.js      # RSS 2.0 + Atom parsing via fast-xml-parser, normalized item shape
    html-to-text.js     # HTML processing: plain text fallback + image constraining
    email.js            # Resend API email sending wrapper
    rate-limit.js       # IP-based rate limiting: config, rolling window check, endpoint name mapping
    templates.js        # Handlebars precompiled template rendering — render(name, data)
  templates/            # Handlebars (.hbs) source files, precompiled at build time
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
wrangler.toml           # Worker config, cron, D1 binding, SITES config, route pattern
```

### Key Design Decisions

- **Multi-site support:** All config is in a `SITES` JSON array (in `wrangler.toml` vars). Each site has its own subscriber list, feeds, sender identity, and CORS origins. All routes accept a `siteId` parameter to scope operations.
- **No info leakage:** Subscribe endpoint always returns the same success response regardless of whether email is new, already subscribed, rate-limited, or unsubscribed. Verify endpoint shows the same error for invalid and expired tokens.
- **Verification rate limiting:** `verification_attempts` table tracks emails sent per subscriber. Rolling window (`VERIFY_WINDOW_HOURS`, default 24h) with max attempts (`VERIFY_MAX_ATTEMPTS`, default 3).
- **IP-based rate limiting:** `rate_limits` table tracks requests per IP per endpoint using a rolling window. Configurable per endpoint (subscribe: 10/hr, verify: 20/hr, unsubscribe: 20/hr, send: 5/hr, admin: 30/hr). Rate limiting runs before authentication to protect against brute-force API key guessing. `Retry-After` header uses oldest-request-expiry strategy with 0–30s random jitter to prevent thundering herd retries. Expired rows for the specific IP+endpoint are cleaned up on every check; rows older than 7 days (from IPs that stopped visiting) are pruned probabilistically — 1% chance per check — via a fire-and-forget global DELETE, distributing cleanup load across normal traffic without blocking request handling.
- **Strict HTTP method enforcement:** `ROUTE_METHODS` in `index.js` explicitly lists every route and its allowed methods. Known routes with wrong methods receive a deliberate 10-second delay then 408 timeout (discourages bot probing). Unknown paths get an immediate 404 with no body.
- **Strict input validation:** Subscribe endpoint rejects requests with any fields beyond `email` and `siteId` (same error as malformed JSON — no info leak). This enables invisible honeypot fields in the subscribe form.
- **Feed bootstrapping:** First time a feed URL is seen, all existing items are inserted into `sent_items` with `recipient_count = 0` — prevents blasting historical content on first deployment.
- **Per-subscriber sends:** Each subscriber gets an individual email with personalized `List-Unsubscribe` headers. Template uses `%%UNSUBSCRIBE_URL%%` placeholder replaced per-subscriber before sending. The `subscriber_sends` table tracks delivery per-subscriber so partial sends (from quota exhaustion) can resume on the next cron run without duplicates.
- **Resend rate limit handling:** The email module retries 429 responses up to 3 times, respecting the `retry-after` header (capped at 60s). If quota is exhausted, the send loop halts and the item is left unmarked in `sent_items` so the next run retries remaining subscribers.
- **Handlebars templates** are precompiled at build time (`scripts/precompile-templates.mjs`) because Cloudflare Workers disallow `new Function()`. The runtime uses `Handlebars.template()` with precompiled specs.
- **User-Agent** uses semver from `package.json` (imported with `{ type: "json" }`).
- **Zero tracking:** No open pixels or click tracking.

### D1 Schema (5 tables)

- `subscribers` — email, site_id, status (pending/verified/unsubscribed), verify_token, unsubscribe_token. UNIQUE(email, site_id).
- `verification_attempts` — subscriber_id, sent_at. Used for rolling window rate limiting.
- `sent_items` — item_id, feed_url, title, recipient_count. UNIQUE(item_id, feed_url). Tracks both seeded (bootstrapped) and actually-sent items. Only inserted when all subscribers have been reached.
- `subscriber_sends` — subscriber_id, item_id, feed_url. UNIQUE(subscriber_id, item_id, feed_url). Per-subscriber deduplication so partial sends (interrupted by quota exhaustion) can resume without re-sending.
- `rate_limits` — ip, endpoint, requested_at. Indexed on (ip, endpoint, requested_at) for efficient rolling window queries. Expired rows are cleaned up on each check.

### API Routes

**Public (CORS-enabled for configured origins):**
- `POST /api/subscribe` — `{email, siteId}` (only these two fields accepted; extra fields are rejected)
- `GET /api/verify?token=` — Returns HTML page
- `GET|POST /api/unsubscribe?token=` — GET returns HTML, POST is RFC 8058 one-click

**Authenticated (Bearer token via `ADMIN_API_KEY`):**
- `POST /api/send` — Manual feed check + send, optional `{siteId}` filter
- `GET /api/admin/stats?siteId=` — Subscriber counts + sent item stats
- `GET /api/admin/subscribers?siteId=&status=` — Subscriber list with optional status filter

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
- `BASE_URL` — Public base URL of the service (e.g. `https://feedmail.cc`), used to construct verify/unsubscribe links in emails
- `SITES` — JSON array of site objects (id, url, name, fromEmail, fromName, replyTo (optional), corsOrigins, feeds)
- `VERIFY_MAX_ATTEMPTS` — Max verification emails per rolling window (default "3")
- `VERIFY_WINDOW_HOURS` — Rolling window in hours (default "24")

**Secrets (set via `wrangler secret put`):**
- `RESEND_API_KEY`
- `ADMIN_API_KEY`

**Local dev secrets** go in `.dev.vars` (gitignored):
```
RESEND_API_KEY=re_xxxxxxxxx
ADMIN_API_KEY=any-test-value
```

### Cron Trigger

Configured in `wrangler.toml` as `0 */6 * * *` (every 6 hours). Calls `checkFeedsAndSend(env)` which iterates all sites and feeds.

### Route Configuration

The feedmail Worker handles only API traffic via the route pattern `feedmail.cc/api/*`. A separate `feedmail-website` Worker handles all other traffic on the domain. Both Workers share the `feedmail.cc` zone via pattern-based routing.
