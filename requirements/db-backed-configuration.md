---
guid: DCD5EDC1-13F5-40D9-A12B-BA27EE9C1DA9
date: 2026-03-06
feature: db-backed-configuration
---

#### Feature: DB-backed Configuration

Config is moved from `wrangler.toml` env vars into D1, with admin API endpoints for managing site settings, channels, and feeds. Enables runtime config management without redeployment, and lays the schema groundwork for a future managed multi-site product.

#### Requirements

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | Site config DB schema | New D1 table stores site-level settings: verify_max_attempts, verify_window_hours | Migration creates `site_config` table. Table holds a single row of site settings. | If table is empty, Worker falls back to hardcoded defaults for verify settings |
| 2 | Rate limit config DB schema | New D1 table stores per-endpoint rate limit settings: window and max requests | Migration creates `rate_limit_config` table with one row per named endpoint (subscribe, verify, unsubscribe, send, admin). Table is seeded with current default values. | If a named endpoint has no row, the Worker falls back to the current hardcoded default for that endpoint |
| 3 | Channel DB schema | New D1 table stores channel config, replacing the CHANNELS env var | Migration creates `channels` table with all current channel fields (id, siteName, siteUrl, fromUser, fromName, replyTo, companyName, companyAddress, corsOrigins). corsOrigins stored as JSON array. | — |
| 4 | Feed DB schema | Feeds become a child table of channels, replacing the nested feeds array in CHANNELS | Migration creates `feeds` table with channel_id FK, name, and url. UNIQUE(channel_id, url). | — |
| 5 | CHANNELS env var removed | Worker no longer reads the CHANNELS JSON var at startup | Deploying without CHANNELS defined succeeds. All channel config is read from the DB at runtime. | — |
| 6 | Verify setting env vars removed | VERIFY_MAX_ATTEMPTS and VERIFY_WINDOW_HOURS env vars are no longer read | Deploying without these vars defined succeeds. Verify settings are read from site_config at runtime. | — |
| 7 | Rate limits read from DB | Per-endpoint rate limit configs come from the DB instead of hardcoded values | Rate limit checks use the window_hours and max_requests values from rate_limit_config. Changes to rate limit config take effect immediately at runtime (no redeploy needed). | Missing endpoint row uses hardcoded default |
| 8 | Config validated at write time | All management API writes validate config before persisting | Invalid field values return 400 with an error message. Valid writes are immediately reflected in runtime behavior. Validation rules are equivalent to current startup validation: fromUser must not contain `@` or whitespace; feed URLs must be unique within a channel (exact match); feed names must be unique within a channel (case-insensitive); required fields must be present. | — |
| 9 | Get site settings | GET /api/admin/config returns current site-level settings and per-endpoint rate limit config | Returns verify_max_attempts, verify_window_hours, and a map of per-endpoint rate limit configs (window and max requests for each). Requires ADMIN_API_KEY bearer auth. | — |
| 10 | Update site settings | PATCH /api/admin/config updates verify settings and/or rate limit config for one or more endpoints | verify_max_attempts must be a positive integer; verify_window_hours must be a positive number. Per-endpoint rate limit fields (windowHours, maxRequests) must be positive numbers. Partial updates accepted (only supplied fields are changed). Returns updated config. | Non-numeric, zero, or negative values return 400 |
| 11 | List channels | GET /api/admin/channels returns all channels | Returns array of channel objects including all fields. Feeds are NOT included in the list response (separate endpoint). | Returns empty array if no channels exist |
| 12 | Get channel | GET /api/admin/channels/{channelId} returns a single channel with its feeds | Returns full channel object. Feed list included in response. | Returns 404 if channel not found |
| 13 | Create channel | POST /api/admin/channels creates a new channel | All required fields (id, siteName, siteUrl, fromUser, fromName, corsOrigins, at least one feed) validated. Channel ID is immutable after creation. Returns the created channel. | Duplicate channel ID returns 409; invalid fromUser (contains `@` or whitespace) returns 400; missing required fields return 400; channels without feeds are not allowed at creation time |
| 14 | Update channel | PUT /api/admin/channels/{channelId} replaces updatable channel fields | All fields except ID can be updated (siteName, siteUrl, fromUser, fromName, replyTo, companyName, companyAddress, corsOrigins). Same validation rules as creation apply. Returns updated channel. | Channel not found returns 404; attempt to change ID is ignored (URL channelId is authoritative) |
| 15 | Delete channel | DELETE /api/admin/channels/{channelId} permanently removes a channel and all its data | Channel row, all its feeds, all its subscribers (and their verification_attempts, subscriber_sends), and all sent_items for those feeds are hard-deleted. Returns 204 on success. | Channel not found returns 404 |
| 16 | List feeds | GET /api/admin/channels/{channelId}/feeds returns all feeds for a channel | Returns array of feed objects. | Channel not found returns 404; returns empty array if channel has no feeds |
| 17 | Add feed | POST /api/admin/channels/{channelId}/feeds adds a feed to a channel | Feed with name and url is created and associated with the channel. URL must be unique within the channel (exact match). Name must be unique within the channel (case-insensitive). Returns created feed. On the next cron run, the feed is bootstrapped (existing items seeded) exactly as a brand-new feed would be today. | Duplicate URL within channel returns 409; duplicate name (case-insensitive) within channel returns 409; invalid URL returns 400; channel not found returns 404 |
| 18 | Update feed | PUT /api/admin/channels/{channelId}/feeds/{feedId} updates a feed's name and/or url | Feed name and URL can be updated. If URL is changed, the new URL is treated as a fresh feed on the next cron run (existing sent_items are associated with the old URL and the new URL will be bootstrapped). | Feed not found returns 404; new URL that duplicates another feed in the same channel returns 409; new name that duplicates another feed (case-insensitive) in the same channel returns 409 |
| 19 | Delete feed | DELETE /api/admin/channels/{channelId}/feeds/{feedId} permanently removes a feed | Feed row and all associated sent_items (by feed_url) are hard-deleted. Returns 204 on success. | Feed not found returns 404 |
| 20 | Auth on management endpoints | All new management endpoints require ADMIN_API_KEY bearer token | Unauthenticated requests to any /api/admin/* endpoint return 401. Applies to all new endpoints (#9–#19). | — |
| 21 | Worker handles empty DB | Worker starts and processes requests even when config tables are empty | Requests to public endpoints with an unrecognized or absent channelId return the same errors as today for an unknown channelId. Management API endpoints remain accessible. | — |
| 22 | Migration script | Script seeds DB from existing wrangler.toml / env config for existing deployments | Script reads CHANNELS JSON, DOMAIN, VERIFY_MAX_ATTEMPTS, VERIFY_WINDOW_HOURS from the current environment and inserts corresponding rows into site_config, channels, feeds, and rate_limit_config. Script exits with a clear error if the target tables already contain data (prevents accidental double-migration). | — |

#### Out of scope

- **DOMAIN as a DB field**: Domain is an infrastructure-level setting and remains in wrangler.toml env vars.
- **Multi-site support**: The open source schema is intentionally single-site. A future managed version will add a sites-list table on top of this structure.
- **Bootstrap/setup endpoint**: New deployments configure via the management API or a separate setup script; there is no in-app bootstrap endpoint.
- **Admin console UI**: The admin UI that will consume these APIs is a separate project.
- **Channel ID changes**: Channel IDs are immutable after creation. Renaming with cascade is not supported.
- **Automatic env-to-DB migration on boot**: The migration is a one-time script, not an automatic fallback at runtime.
- **RESEND_API_KEY and ADMIN_API_KEY**: Secrets remain in env vars and are not moved to the DB.

## Technical Specification

### Summary

This feature migrates channel configuration, verification settings, and rate limit configuration from `wrangler.toml` environment variables into D1 database tables. It introduces admin API endpoints for runtime CRUD management of site settings, channels, and feeds, eliminating the need to redeploy for configuration changes. The `CHANNELS`, `VERIFY_MAX_ATTEMPTS`, and `VERIFY_WINDOW_HOURS` env vars are removed; `DOMAIN`, `RESEND_API_KEY`, and `ADMIN_API_KEY` remain in env vars. A one-time migration script seeds the DB from existing env config for current deployments.

### Requirements Table

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | Site config DB schema | New D1 migration creates a `site_config` table storing site-level settings: `verify_max_attempts` (INTEGER, NOT NULL, DEFAULT 3) and `verify_window_hours` (INTEGER, NOT NULL, DEFAULT 24). Single-row enforced via `id INTEGER PRIMARY KEY CHECK (id = 1)`. | Migration `0005_config_tables.sql` creates the table with correct column types and defaults. Applying the migration on an empty DB succeeds. | If the table is empty (no row), `getVerifyLimits()` falls back to hardcoded defaults (maxAttempts=3, windowHours=24). |
| 2 | Rate limit config DB schema | Same migration creates a `rate_limit_config` table with columns: `endpoint` (TEXT PRIMARY KEY), `max_requests` (INTEGER NOT NULL), `window_seconds` (INTEGER NOT NULL). Seeded with five default rows. | Migration inserts the five default rows: subscribe(10, 3600), verify(20, 3600), unsubscribe(20, 3600), send(5, 3600), admin(30, 3600). Querying all five rows after migration returns correct defaults. | If a given endpoint name has no row at runtime, the Worker falls back to the current hardcoded default from the `RATE_LIMITS` constant. |
| 3 | Channel DB schema | Same migration creates a `channels` table replacing the CHANNELS env var. Columns: `id` (TEXT PRIMARY KEY), `site_name` (TEXT NOT NULL), `site_url` (TEXT NOT NULL), `from_user` (TEXT NOT NULL), `from_name` (TEXT NOT NULL), `reply_to` (TEXT), `company_name` (TEXT), `company_address` (TEXT), `cors_origins` (TEXT NOT NULL -- JSON array string), `created_at` (TEXT NOT NULL DEFAULT datetime('now')), `updated_at` (TEXT NOT NULL DEFAULT datetime('now')). | Migration creates the table. All column constraints are enforced. The `id` column is the primary key (immutable natural key). | Inserting a duplicate `id` fails with a UNIQUE constraint violation. |
| 4 | Feed DB schema | Same migration creates a `feeds` table as a child of channels. Columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `channel_id` (TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE), `name` (TEXT NOT NULL), `url` (TEXT NOT NULL), `created_at` (TEXT NOT NULL DEFAULT datetime('now')), `updated_at` (TEXT NOT NULL DEFAULT datetime('now')). UNIQUE(channel_id, url). Index on channel_id. | Migration creates the table with FK constraint and unique constraint. Duplicate URL for same channel fails. Same URL for different channels succeeds. Deleting a channel cascades to delete its feeds. | -- |
| 5 | CHANNELS env var removed | The Worker no longer reads `env.CHANNELS`. The `getChannels()` function in `src/lib/config.js` is replaced with an async DB-reading function. The CHANNELS var is removed from `wrangler.toml` and `wrangler.test.toml`. | Deploying without `CHANNELS` defined succeeds. All channel config is read from the DB at runtime. The module-level `channelsCache` synchronous caching pattern is removed. | If the channels table is empty, functions that depend on channel data return appropriate errors for unknown channelId. |
| 6 | Verify setting env vars removed | The Worker no longer reads `env.VERIFY_MAX_ATTEMPTS` or `env.VERIFY_WINDOW_HOURS`. The `getVerifyLimits()` function is replaced with an async DB-reading function that queries `site_config`. These vars are removed from `wrangler.toml` and `wrangler.test.toml`. | Deploying without these vars defined succeeds. Verify settings come from the `site_config` table. | If `site_config` is empty, defaults to maxAttempts=3, windowHours=24. |
| 7 | Rate limits read from DB | The `RATE_LIMITS` hardcoded object in `src/lib/rate-limit.js` becomes a fallback. At runtime, `src/index.js` reads rate limit config from `rate_limit_config` before calling `checkRateLimit()`. | Changing a `rate_limit_config` row in the DB immediately affects the next request (no cache, no redeploy). Each endpoint uses its own DB row's values. | Missing endpoint row uses the hardcoded default. If the entire table is empty, all endpoints use hardcoded defaults. |
| 8 | Config validated at write time | All management API write endpoints validate input before persisting to the DB. Validation rules match the current `validateConfig()` logic in `src/lib/config.js`. | Invalid `fromUser` (contains `@` or whitespace) returns 400. Duplicate feed URL within a channel returns 409. Duplicate feed name (case-insensitive) within a channel returns 409. Missing required channel fields return 400. Non-positive verify/rate-limit values return 400. All error responses include a descriptive JSON error message. | Empty string for required fields is treated as missing. Validation on feed uniqueness excludes the feed being updated (for PUT). |
| 9 | Get site settings | `GET /api/admin/config` returns current site-level settings and per-endpoint rate limit config as JSON. | Response body: `{ "verify": { "maxAttempts": number, "windowHours": number }, "rateLimits": { "subscribe": { "maxRequests": number, "windowSeconds": number }, ... } }`. Returns hardcoded defaults for any values not in the DB. Requires ADMIN_API_KEY bearer auth. Returns 200. | If site_config has no row, returns hardcoded defaults for verify settings. If rate_limit_config is missing rows, returns hardcoded defaults for those endpoints. |
| 10 | Update site settings | `PATCH /api/admin/config` accepts a JSON body with optional `verify` and/or `rateLimits` fields. Partial updates only. | `verify.maxAttempts` must be a positive integer. `verify.windowHours` must be a positive integer. Per-endpoint `maxRequests` and `windowSeconds` must be positive integers. Returns 200 with full updated config. Returns 400 for invalid values. | Unknown endpoint name in rateLimits rejected with 400. Supplying only `verify` does not affect rateLimits and vice versa. UPSERT semantics for site_config row. |
| 11 | List channels | `GET /api/admin/channels` returns all channels as a JSON array. | Response: `{ "channels": [...] }`. Each channel includes all fields. Feeds NOT included. corsOrigins returned as parsed JSON array. Returns 200. | Returns `{ "channels": [] }` if no channels exist. |
| 12 | Get channel | `GET /api/admin/channels/{channelId}` returns a single channel with its feeds. | Response includes all channel fields plus a `feeds` array of `{ id, name, url }` objects. Returns 200. | Returns 404 with `{ "error": "Channel not found" }` if channelId does not exist. |
| 13 | Create channel | `POST /api/admin/channels` creates a new channel with at least one feed. | Required: id, siteName, siteUrl, fromUser, fromName, corsOrigins (array), feeds (array, min 1 entry with name and url). Optional: replyTo, companyName, companyAddress. Channel ID immutable after creation. Returns 201 with created channel including feeds. | Duplicate channel ID returns 409. Invalid fromUser returns 400. Missing required fields return 400. Empty feeds array returns 400. Duplicate feed URL/name within provided feeds returns 409. |
| 14 | Update channel | `PUT /api/admin/channels/{channelId}` replaces updatable channel fields. | Updatable: siteName, siteUrl, fromUser, fromName, replyTo, companyName, companyAddress, corsOrigins. `id` in body is ignored. Feeds NOT managed here. Same validation as creation. Returns 200 with updated channel. | Channel not found returns 404. |
| 15 | Delete channel | `DELETE /api/admin/channels/{channelId}` permanently removes a channel and all associated data. | Deletes: channel row, feeds (CASCADE), subscribers with matching channel_id, their verification_attempts/subscriber_sends (CASCADE), and sent_items/subscriber_sends matching the channel's feed URLs. Returns 204 with no body. | Channel not found returns 404. sent_items cleanup requires querying feed URLs before deleting channel/feeds. |
| 16 | List feeds | `GET /api/admin/channels/{channelId}/feeds` returns all feeds for a channel. | Response: `{ "channelId": "...", "feeds": [{ "id": number, "name": "...", "url": "..." }, ...] }`. Returns 200. | Channel not found returns 404. Empty feeds array if channel has no feeds. |
| 17 | Add feed | `POST /api/admin/channels/{channelId}/feeds` adds a feed to a channel. | Request body: `{ "name": "...", "url": "..." }`. URL unique within channel (exact match). Name unique within channel (case-insensitive). Returns 201 with created feed including id. New feed bootstrapped on next cron run. | Duplicate URL returns 409. Duplicate name returns 409. Invalid/missing name or url returns 400. Channel not found returns 404. |
| 18 | Update feed | `PUT /api/admin/channels/{channelId}/feeds/{feedId}` updates a feed's name and/or URL. | Uniqueness checks exclude the feed being updated. Changed URL treated as fresh feed on next cron (old sent_items remain, new URL bootstrapped). Returns 200 with updated feed. | Feed not found returns 404 (validates feedId belongs to channelId). Duplicate URL/name against other feeds in same channel returns 409. |
| 19 | Delete feed | `DELETE /api/admin/channels/{channelId}/feeds/{feedId}` removes a feed. | Deletes feed row, all sent_items where feed_url matches, and subscriber_sends where feed_url matches. Returns 204. | Feed not found returns 404 (validates feedId belongs to channelId). |
| 20 | Auth on management endpoints | All new management endpoints under `/api/admin/*` require ADMIN_API_KEY bearer auth. | Unauthenticated requests return 401. Covered by existing auth check in `src/index.js` for the `/api/admin/` prefix. | -- |
| 21 | Worker handles empty DB | Worker starts and processes requests when all config tables are empty. | Public endpoints return appropriate errors for unknown channelId. Cron handler processes zero channels without error. Management API endpoints remain accessible and return empty results. CORS returns no allowed origins (403 for preflight). | Send endpoint returns `{ "sent": 0, "items": [] }` with no errors when no channels exist. |
| 22 | Migration script | Node.js script (`scripts/migrate-env-to-db.mjs`) reads config from existing wrangler.toml environment and inserts into D1. | Reads CHANNELS JSON, VERIFY_MAX_ATTEMPTS, VERIFY_WINDOW_HOURS and inserts into site_config, channels, feeds, rate_limit_config. Exits with error if any target table already contains data. Logs insertions. Accepts `--local` flag for local vs remote D1. | Empty CHANNELS array inserts no channel/feed rows but still writes site_config and rate_limit_config. Missing verify vars use hardcoded defaults. |

### New Files

1. **`migrations/0005_config_tables.sql`** — Creates `site_config`, `rate_limit_config`, `channels`, and `feeds` tables. Seeds rate limit defaults.
2. **`src/routes/admin-config.js`** — GET/PATCH `/api/admin/config` handler.
3. **`src/routes/admin-channels.js`** — Channel CRUD handler.
4. **`src/routes/admin-feeds.js`** — Feed CRUD handler under channels.
5. **`scripts/migrate-env-to-db.mjs`** — One-time migration script.

### Files That Change

- **`src/lib/config.js`** — Major rewrite: all functions become async, read from D1. Validation extracted into reusable functions.
- **`src/lib/db.js`** — New CRUD helpers for all 4 config tables.
- **`src/index.js`** — Route table update for admin prefix matching, async rate limit lookup.
- **`src/routes/admin.js`** — Expanded routing to new sub-handlers.
- **`src/routes/subscribe.js`**, **`verify.js`**, **`unsubscribe.js`**, **`send.js`** — Async config calls.
- **`src/lib/cors.js`** — Async CORS origin lookup.
- **`src/lib/templates.js`** — Async `renderErrorPage`.
- **`wrangler.toml`**, **`wrangler.test.toml`** — Remove CHANNELS/verify env vars.
- **`package.json`**, **`scripts/test-local.sh`** — New scripts.

### Architectural Decisions

- **No in-memory caching**: Module-level `channelsCache` removed. D1 is datacenter-local.
- **Column naming**: DB snake_case, JS camelCase, helpers handle mapping.
- **Feeds integer PK**: Auto-increment `id` for stable REST URLs.
- **Admin route prefix matching**: `isMethodAllowed` recognizes `/api/admin/` prefix; `handleAdmin` handles internal 404/405.

### Implementation Order

1. DB schema (reqs 1-4) → 2. Validation extraction (req 8) → 3. Env var removal + async migration (reqs 5-7) → 4. API endpoints (reqs 9-19) → 5. Empty DB handling (req 21) → 6. Migration script (req 22)
