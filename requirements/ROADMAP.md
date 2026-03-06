# Roadmap

## Overview

feedmail is an RSS-to-email microservice for Cloudflare Workers. It monitors RSS/Atom feeds for new items and emails them to verified subscribers via Resend. A single deployment supports multiple channels, each with its own subscriber list, feeds, and sender identity.

The project reached 1.0.0 with a solid core: multi-channel support, per-subscriber personalisation, strict security layering, email deliverability signals (List-Unsubscribe headers, standardised footers), and a well-validated channel configuration schema. The "Open Source Ready" release (2.1.0) completed the goal of making feedmail genuinely distributable: DB-backed configuration provides runtime admin API management, and open-source packaging enables anyone with a Cloudflare account to self-host feedmail with a single curl command.

---

## Shipped

| Feature | Description | GUID | PR |
|---------|-------------|------|----|
| [email-deliverability-improvements](./email-deliverability-improvements.md) | Added List-Unsubscribe headers to verification emails and standardised the email footer with an optional company name/address block | `33B92369-DA50-4B57-8CD7-87CC1CBF37D2` | #19 |
| [channel-config-restructuring](./channel-config-restructuring.md) | Restructured config from SITES/BASE\_URL to CHANNELS/DOMAIN with fromUser email local parts, structured feed objects, and startup config validation | `9C58F879-27FF-48F6-B7A4-D2D3F53F5E71` | #22 |
| [db-backed-configuration](./db-backed-configuration.md) | Moves channel/site config from wrangler.toml env vars to D1, with a full admin API for creating and managing channels, feeds, and rate limit settings at runtime | `DCD5EDC1-13F5-40D9-A12B-BA27EE9C1DA9` | #26 |
| [open-source-packaging](./open-source-packaging.md) | Enables self-hosting via a curl-installable bootstrap script and interactive setup wizard, a sanitised wrangler.toml template, and an updated README | `3C2D77DC-8AB5-439C-B1C8-FB6BB636A83F` | #27 |
