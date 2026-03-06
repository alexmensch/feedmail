---
guid: 9C58F879-27FF-48F6-B7A4-D2D3F53F5E71
date: 2026-03-05
feature: channel-config-restructuring
---

## Feature: Channel Configuration Restructuring

Restructure the site/channel configuration to align email sending domains with API link domains (improving email deliverability), rename SITES to CHANNELS to better reflect the deployment model where a single deployment is the site and channels are subscriber lists with feeds, and add structured feed metadata with named feeds.

## Requirements

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | Replace BASE_URL with DOMAIN | A new top-level `DOMAIN` env var replaces `BASE_URL`. All URL construction uses `https://{DOMAIN}` as the base. From-email is constructed as `{fromUser}@{DOMAIN}`. `BASE_URL` is removed entirely. | - All generated URLs (verify, unsubscribe) use `https://{DOMAIN}/api/...` - From-email address in all sent emails is `{fromUser}@{DOMAIN}` - `BASE_URL` is no longer read or referenced in application code - HTTPS is always assumed; no protocol config exists | - DOMAIN must not include protocol (`https://`), trailing slash, or path segments — config validation rejects these - DOMAIN must be present and non-empty; service fails to start without it |
| 2 | Rename SITES to CHANNELS | The top-level config key changes from `SITES` to `CHANNELS`. All references throughout the codebase update from "site" terminology to "channel" terminology. API parameter `siteId` becomes `channelId`. DB column `site_id` becomes `channel_id` via migration. | - Config is parsed from `CHANNELS` env var (JSON array) - `POST /api/subscribe` accepts `channelId` (not `siteId`) - `GET /api/admin/stats` and `GET /api/admin/subscribers` accept `channelId` query param - `POST /api/send` accepts optional `channelId` filter - DB tables (`subscribers`, `subscriber_sends`) use `channel_id` column - No remaining references to "site" in variable names, function names, or user-facing strings (except `siteName`/`siteUrl` which intentionally refer to the external content site) | - DB migration must rename columns and recreate unique constraints/indexes that reference them - Existing data in `site_id` columns is preserved during migration |
| 3 | Rename and restructure channel fields | Within each channel object: `name` → `siteName`, `url` → `siteUrl`, `fromEmail` → `fromUser`. `fromUser` stores only the email local part (e.g., `"hello"`). The full from-email is `{fromUser}@{DOMAIN}`. | - Channel config accepts `siteName`, `siteUrl`, `fromUser` - From-email in sent emails is `{fromUser}@{DOMAIN}` - `fromName` and `replyTo` remain unchanged - `siteName` and `siteUrl` are used in email templates wherever `name` and `url` were used previously | - `fromUser` must not contain `@` or whitespace — config validation rejects these - `fromUser` must be non-empty |
| 4 | Structured feed objects | `feeds` changes from an array of URL strings to an array of objects with required `name` (string) and `url` (string) properties. | - Each feed in config has both `name` and `url` - Feed URLs are used for fetching exactly as bare URL strings were before - Feed names are stored and available to the system (no subscriber-facing use in this change) - A channel with an empty feeds array is valid | - Feed object missing `name` or `url` fails config validation - Feed with empty string `name` or `url` fails config validation |
| 5 | Config validation at startup | The service validates all channel configuration at startup and refuses to start if validation fails. Error messages clearly identify which channel and field failed. | - Duplicate feed URLs within same channel → startup failure - Duplicate feed names within same channel (case-insensitive: lowercased before comparison) → startup failure - Missing required fields (`id`, `siteName`, `siteUrl`, `fromUser`, `fromName`, `corsOrigins`) → startup failure - Invalid `DOMAIN` (contains protocol, path, trailing slash, or is empty) → startup failure - Invalid `fromUser` (contains `@`, whitespace, or is empty) → startup failure | - Two different channels may share feed URLs or feed names — uniqueness is per-channel only - `"Blog Posts"` and `"blog posts"` are considered duplicates within the same channel |
| 6 | Remove hardcoded domain references | No references to `feedmail.cc` exist in application code. All domain-dependent URL and email construction uses the `DOMAIN` env var. | - No string literal `feedmail.cc` in any `.js` file under `src/` - Test fixtures and test config use appropriate test values, not `feedmail.cc` | - Documentation (CLAUDE.md, README) may still reference `feedmail.cc` as an example — documentation updates are out of scope for this feature |

## Out of scope

- **Per-feed subscription management** — future feature where subscribers choose which feeds they receive within a channel
- **DB-backed configuration** — the entire config schema will move from wrangler env vars to database in a future change
- **Automated deployment scripting** — future tooling to configure DOMAIN, routes, and other settings from a single input
- **Staging environment setup** — full email flow testing with clickable links uses a staging deployment, not local dev
- **Documentation updates** — CLAUDE.md, README, and other docs may still reference `feedmail.cc` as an example
- **Subscriber-facing display of feed names** — feed names are structural preparation only; no UI or email changes to surface them
- **Backward compatibility** — no aliases for old field names (`siteId`, `fromEmail`, `name`, `url`) or the `SITES`/`BASE_URL` env vars
