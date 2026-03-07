# Roadmap

## Overview

feedmail is an RSS-to-email microservice for Cloudflare Workers. It monitors RSS/Atom feeds for new items and emails them to verified subscribers via Resend. A single deployment supports multiple channels, each with its own subscriber list, feeds, and sender identity.

The project reached 1.0.0 with a solid core: multi-channel support, per-subscriber personalisation, strict security layering, email deliverability signals (List-Unsubscribe headers, standardised footers), and a well-validated channel configuration schema. The "Open Source Ready" release (2.1.0) completed the goal of making feedmail genuinely distributable: DB-backed configuration provides runtime admin API management, and open-source packaging enables anyone with a Cloudflare account to self-host feedmail with a single curl command.

The next priority is an admin console — a browser-based interface that gives operators visual access to the management capabilities currently available only through the admin API. The console runs as a separate Cloudflare Worker alongside the existing API Worker, using the admin API as its data layer rather than accessing D1 directly. This keeps the API as the single source of truth and allows the console to be scaled or replaced independently. Authentication uses passkeys as the primary login method with magic link email as a fallback — no passwords, no third-party SSO. Features are sequenced so that each step delivers testable, working functionality: magic link auth provides a complete login system first, passkey support layers on top, the styled UI brings it all together, and enhancements add pagination and config editing after the core console is usable.

---

## Target Users

### Self-hosting operator

A developer or technically proficient sysadmin who runs feedmail on their own Cloudflare account. They are comfortable with CLI tools, wrangler, and API calls. They choose feedmail because it's lightweight, self-hosted, and avoids third-party newsletter platforms. They want an admin UI for convenience and visibility, not because they can't use the API — it saves time on routine tasks like checking subscriber counts and managing feeds. They value simplicity, zero lock-in, and full control over their data.

### Subscriber

A reader who subscribes to receive feed updates via email. They interact with feedmail only through the subscribe form, verification email, and newsletter emails. They expect a frictionless subscribe flow, reliable email delivery, and easy one-click unsubscribe. They never see the admin interface.

---

## Planned

### Release: Admin Console

A browser-based admin console with passwordless authentication, giving operators a visual interface for managing channels, feeds, and subscribers without API calls.

| # | Feature | Description | GUID |
|---|---------|-------------|------|
| 1 | [admin-auth-magic-link](./admin-auth-magic-link.md) | Establishes the admin Worker, session management, and magic link email login for the admin console | `233E72F0-C4B3-41A8-8A4E-5AEC156C456E` |
| 2 | [admin-auth-passkey](./admin-auth-passkey.md) | Adds passkey (WebAuthn) authentication as the primary login method, with magic link as fallback | `FF8F870D-4FD8-491F-9DF2-A4D5E332BE22` |
| 3 | [admin-console-ui](./admin-console-ui.md) | Server-rendered admin UI with HTMX and CUBE CSS: dashboard, channel/feed CRUD, subscriber list, and styled auth pages | `D108788E-EB05-4EFC-B7AD-FB9840790A69` |

### Release: Admin Console Enhancements

Paginated subscriber lists and in-browser site configuration editing.

| # | Feature | Description | GUID |
|---|---------|-------------|------|
| 4 | [admin-console-enhancements](./admin-console-enhancements.md) | Server-side subscriber list pagination with API changes, and site config editing in the Settings page | `0921300D-83E6-4423-AE32-DFB5ED5BD88A` |

---

## Shipped

| Feature | Description | GUID | PR |
|---------|-------------|------|----|
| [email-deliverability-improvements](./email-deliverability-improvements.md) | Added List-Unsubscribe headers to verification emails and standardised the email footer with an optional company name/address block | `33B92369-DA50-4B57-8CD7-87CC1CBF37D2` | #19 |
| [channel-config-restructuring](./channel-config-restructuring.md) | Restructured config from SITES/BASE\_URL to CHANNELS/DOMAIN with fromUser email local parts, structured feed objects, and startup config validation | `9C58F879-27FF-48F6-B7A4-D2D3F53F5E71` | #22 |
| [db-backed-configuration](./db-backed-configuration.md) | Moves channel/site config from wrangler.toml env vars to D1, with a full admin API for creating and managing channels, feeds, and rate limit settings at runtime | `DCD5EDC1-13F5-40D9-A12B-BA27EE9C1DA9` | #26 |
| [open-source-packaging](./open-source-packaging.md) | Enables self-hosting via a curl-installable bootstrap script and interactive setup wizard, a sanitised wrangler.toml template, and an updated README | `3C2D77DC-8AB5-439C-B1C8-FB6BB636A83F` | #27 |
