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
