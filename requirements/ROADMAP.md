# Roadmap

## Overview

feedmail is an RSS-to-email microservice for Cloudflare Workers. It monitors RSS/Atom feeds for new items and emails them to verified subscribers via Resend. A single deployment supports multiple channels, each with its own subscriber list, feeds, and sender identity.

The project reached 1.0.0 with a solid core: multi-channel support, per-subscriber personalisation, strict security layering, email deliverability signals, and a well-validated channel configuration schema. The "Open Source Ready" release (2.1.0) completed the goal of making feedmail genuinely distributable: DB-backed configuration provides runtime admin API management, and open-source packaging enables anyone with a Cloudflare account to self-host feedmail with a single curl command. Admin authentication followed with magic link email login and passkey (WebAuthn) support.

The next priority is an admin console — a browser-based interface that gives operators visual access to the management capabilities currently available only through the admin API. The console is built in two phases: first a functional version using plain HTML forms that exercises every admin API endpoint, then a styled version that adds HTMX interactions, CUBE CSS design, responsive layout, and dark mode. This split enables user testing of workflows and scope validation before investing in visual polish.

All settings, credentials, and application state are stored in D1 and changeable at runtime. Only the `DOMAIN` env var remains as a Wrangler configuration item. The setup script is being simplified to handle only what requires CLI access — D1 creation, config file generation, credential seeding, and worker deployment — with the admin console's first-time setup flow guiding operators through channel and feed creation after deployment.

Features are sequenced so that each step delivers testable, working functionality. The functional admin console ships alongside the first-time setup flow and setup script simplification, completing the self-hosting story: deploy via CLI, then manage everything from the browser. The styled console follows as a visual and interaction overhaul. Enhancements add pagination, config editing, and credential management after the core console is complete. A final release collects lower-priority operational improvements — infrastructure hygiene tasks that keep the system tidy but don't change user-facing behaviour.

---

## Target Users

### Self-hosting operator

A developer or technically proficient sysadmin who runs feedmail on their own Cloudflare account. They are comfortable with CLI tools, wrangler, and API calls. They choose feedmail because it's lightweight, self-hosted, and avoids third-party newsletter platforms. They want an admin UI for convenience and visibility, not because they can't use the API — it saves time on routine tasks like checking subscriber counts and managing feeds. They value simplicity, zero lock-in, and full control over their data.

### Subscriber

A reader who subscribes to receive feed updates via email. They interact with feedmail only through the subscribe form, verification email, and newsletter emails. They expect a frictionless subscribe flow, reliable email delivery, and easy one-click unsubscribe. They never see the admin interface.

---

## Planned

### Release: Admin Console (Functional)

A plain HTML admin console with all management functionality, a guided first-time setup flow, and a simplified CLI setup script — completing the self-hosting story from deploy to daily operation.

| #   | Feature                                                   | Description                                                                                                                         | GUID                                   |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | [admin-console-functional](./admin-console-functional.md) | Plain HTML forms covering dashboard, channel/feed CRUD, subscriber list, passkey management, confirmations, and errors              | `5A963535-83B6-4BA9-AB36-0A8C4F29E7BC` |
| 2   | [first-time-setup-flow](./first-time-setup-flow.md)       | Dashboard empty state guides operators through first channel and feed creation entirely within the browser                          | `CFD3690C-0462-4FBB-BA94-4EB2F05B6402` |
| 3   | [setup-simplification](./setup-simplification.md)         | Reduces setup.sh to infrastructure provisioning (D1, config, credential seeding, deploy) with channel creation deferred to admin UI | `9B3EBAC7-65E7-4F80-BB5C-279D25828FAB` |

### Release: Admin Console (Styled)

HTMX interactions, CUBE CSS design system, responsive sidebar layout, dark mode, and visual polish for all admin and auth pages.

| #   | Feature                                           | Description                                                                                                             | GUID                                   |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 4   | [admin-console-styled](./admin-console-styled.md) | HTMX-powered interactions, CUBE CSS with Every Layout primitives, fluid responsive design, dark mode, auth page styling | `D04F43C0-AF8F-4CDA-B9ED-4E9C1D3ACA1B` |

### Release: Admin Console Enhancements

Paginated subscriber lists, in-browser site configuration editing, and credential management (admin email, API keys) without CLI access.

| #   | Feature                                                       | Description                                                                                                                                               | GUID                                   |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 5   | [admin-console-enhancements](./admin-console-enhancements.md) | Server-side subscriber list pagination, site config editing, admin email change with verification, admin API key regeneration, and Resend API key editing | `0921300D-83E6-4423-AE32-DFB5ED5BD88A` |

### Release: Operational Improvements

Lower-priority infrastructure hygiene and non-user-facing enhancements that keep the system tidy as it matures.

| #   | Feature                                                                 | Description                                                                                                                                                                       | GUID                                   |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 6   | [auth-session-cleanup](./auth-session-cleanup.md)                       | Probabilistic cleanup of expired auth sessions and magic link tokens, with a shared utility that also refactors rate limit cleanup                                                | `E0AC5C7B-3792-44B4-89EB-FCC3B89050C4` |
| 7   | [remove-credential-env-fallbacks](./remove-credential-env-fallbacks.md) | Removes env-var fallback for ADMIN_API_KEY and RESEND_API_KEY so the D1 credentials table is the single source of truth, with explicit error logging when credentials are missing | `5CBF07F1-6FFE-4FE0-9DF6-221398A0EFDC` |
| 8   | [rolling-sessions](./rolling-sessions.md)                               | Rolling session expiry (24hr inactivity timeout) with a 7-day absolute cap, replacing the current fixed 24-hour session lifetime                                                  | `26E123A5-1D72-47C8-9E62-AB14F77E55D2` |

---

## Shipped

| Feature                                                                     | Description                                                                                                                                                      | GUID                                   | PR  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --- |
| [email-deliverability-improvements](./email-deliverability-improvements.md) | Added List-Unsubscribe headers to verification emails and standardised the email footer with an optional company name/address block                              | `33B92369-DA50-4B57-8CD7-87CC1CBF37D2` | #19 |
| [channel-config-restructuring](./channel-config-restructuring.md)           | Restructured config from SITES/BASE_URL to CHANNELS/DOMAIN with fromUser email local parts, structured feed objects, and startup config validation               | `9C58F879-27FF-48F6-B7A4-D2D3F53F5E71` | #22 |
| [db-backed-configuration](./db-backed-configuration.md)                     | Moves channel/site config from wrangler.toml env vars to D1, with a full admin API for creating and managing channels, feeds, and rate limit settings at runtime | `DCD5EDC1-13F5-40D9-A12B-BA27EE9C1DA9` | #26 |
| [open-source-packaging](./open-source-packaging.md)                         | Enables self-hosting via a curl-installable bootstrap script and interactive setup wizard, a sanitised wrangler.toml template, and an updated README             | `3C2D77DC-8AB5-439C-B1C8-FB6BB636A83F` | #27 |
| [admin-auth-magic-link](./admin-auth-magic-link.md)                         | Establishes the admin Worker, session management, and magic link email login with DB-stored credentials (admin email, API keys, Resend key)                      | `233E72F0-C4B3-41A8-8A4E-5AEC156C456E` | #38 |
| [trailing-slash-normalization](./trailing-slash-normalization.md)           | Fixes routing failures from trailing slashes and bare `/admin` by normalizing paths early in both workers                                                        | `718F6B2C-024C-4E3B-8C65-A75C078EDDD9` | #41 |
| [admin-auth-passkey](./admin-auth-passkey.md)                               | Adds passkey (WebAuthn) authentication as the primary login method, with magic link as fallback                                                                  | `FF8F870D-4FD8-491F-9DF2-A4D5E332BE22` | #42 |
