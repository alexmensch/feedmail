# Roadmap

## Overview

feedmail is an RSS-to-email microservice for Cloudflare Workers. It monitors RSS/Atom feeds for new items and emails them to verified subscribers via Resend. A single deployment supports multiple channels, each with its own subscriber list, feeds, and sender identity.

The project reached 1.0.0 with a solid core: multi-channel support, per-subscriber personalisation, strict security layering, email deliverability signals (List-Unsubscribe headers, standardised footers), and a well-validated channel configuration schema. The remaining roadmap has one goal: making feedmail genuinely distributable as open source.

The two planned features ship together as a single release. DB-backed configuration is sequenced first because the self-hosting installer depends on the admin API it creates — `setup.sh` creates a channel by posting to `/api/admin/channels`, which only exists after this feature ships. Open-source packaging cannot be completed without a working channel management API. The release is named "Open Source Ready" to reflect what it unlocks: anyone with a Cloudflare account can self-host feedmail with a single curl command.

Sequencing principles: (1) user-facing value at every step — the DB-backed config feature is independently useful to existing deployers who want runtime config management without redeployment; (2) technical prerequisites are respected strictly; (3) `DOMAIN` and secrets remain in env vars by design — infrastructure-level config is intentionally kept separate from runtime channel config, and this scope boundary is load-bearing for the installer design.

---

## Planned

### Release: Open Source Ready

DB-backed configuration removes the need to redeploy for config changes and provides the admin API that the self-hosting installer depends on; open-source packaging then makes the first deployment accessible to anyone with a shell and a Cloudflare account.

| # | Feature | Description | GUID |
|---|---------|-------------|------|
| 1 | [db-backed-configuration](./db-backed-configuration.md) | Moves channel/site config from wrangler.toml env vars to D1, with a full admin API for creating and managing channels, feeds, and rate limit settings at runtime | `DCD5EDC1-13F5-40D9-A12B-BA27EE9C1DA9` |
| 2 | [open-source-packaging](./open-source-packaging.md) | Enables self-hosting via a curl-installable bootstrap script and interactive setup wizard, a sanitised wrangler.toml template, and an updated README | `3C2D77DC-8AB5-439C-B1C8-FB6BB636A83F` |

---

## Shipped

| Feature | Description | GUID | PR |
|---------|-------------|------|----|
| [email-deliverability-improvements](./email-deliverability-improvements.md) | Added List-Unsubscribe headers to verification emails and standardised the email footer with an optional company name/address block | `33B92369-DA50-4B57-8CD7-87CC1CBF37D2` | #19 |
| [channel-config-restructuring](./channel-config-restructuring.md) | Restructured config from SITES/BASE\_URL to CHANNELS/DOMAIN with fromUser email local parts, structured feed objects, and startup config validation | `9C58F879-27FF-48F6-B7A4-D2D3F53F5E71` | #22 |
