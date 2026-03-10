# Roadmap

## Overview

feedmail is a free, self-hosted RSS-to-email service for personal website owners. It monitors RSS/Atom feeds and emails new posts to verified subscribers via Resend, running entirely on Cloudflare Workers. Existing newsletter platforms either charge for RSS-to-email (Buttondown's RSS feature is a $9/month add-on) or are far more complex than a personal site needs. feedmail exists so that anyone with a blog and an RSS feed can offer email subscriptions without paying for or depending on a third-party service. A single deployment supports multiple channels, each with its own subscriber list, feeds, and sender identity.

The project reached 1.0.0 with a solid core: multi-channel support, per-subscriber personalisation, strict security layering, email deliverability signals, and a well-validated channel configuration schema. The "Open Source Ready" release (2.1.0) made feedmail genuinely distributable: DB-backed configuration provides runtime admin API management, and open-source packaging enables anyone with a Cloudflare account to self-host with a single curl command. Admin authentication followed with magic link email login and passkey (WebAuthn) support, and a functional admin console now provides browser-based management of channels, feeds, subscribers, and settings.

The current focus is completing the admin console experience and then shifting to distribution enablement. A rate limit fix for internal service binding requests ships first (the functional console revealed that legitimate admin usage can be throttled), followed by a first-time setup flow that completes the browser-based management story. A styled console follows with HTMX interactions, CUBE CSS, responsive layout, and dark mode — the styled console is intentionally kept before distribution work because a baseline level of visual polish is necessary for people evaluating feedmail to trust it as a serious tool, but the scope of styling is deliberately constrained to avoid polishing before validating with real users.

After the styled console, the Quick Start release prioritises lowering the barrier to adoption. A hardened, idempotent setup script provisions all infrastructure via direct Cloudflare and Resend API calls, with no external toolchain dependencies — making the deploy-to-running experience reliable and one-step. Alternative deployment paths (Cloudflare Deploy Button, GitHub Template) are sequenced after the primary script for users who prefer browser-based or CI-driven workflows. Drop-in subscribe form widgets for popular static site generators follow. Together, these create the foundation for distribution: a blog post can walk someone from deployment to a working subscribe form on their site. The Quick Start release is sequenced before console enhancements because distribution enablement is more strategically urgent than power-user features — the product's biggest open risk is that nobody outside its creator has used it.

All settings, credentials, and application state are stored in D1 and changeable at runtime. Only the `DOMAIN` env var remains as a Wrangler configuration item. Features are sequenced so that each step delivers testable, working functionality to the site owner. Console enhancements (pagination, config editing, credential management) and operational housekeeping (session cleanup, rolling sessions) are grouped into a single release after Quick Start. Beyond the console, a Migration release with import tools for moving subscriber lists from Buttondown, Mailchimp, Ghost, Kit (ConvertKit), and MailerLite completes the planned roadmap.

---

## Target Users

### Personal website owner

A developer or technically inclined hobbyist who runs a personal website — typically a blog or digital garden built with a static site generator like Jekyll, Eleventy, or Hugo, and deployed on their own terms. They write because they want a corner of the internet to share their thoughts, not to build a media business. They already have an RSS feed (most static site generators produce one by default) and want to offer email subscriptions to readers who prefer inbox delivery over feed readers. Existing newsletter services either charge for RSS-to-email functionality (Buttondown charges $9/month) or are overkill for a personal site. They want something free, self-hosted, and simple — deploy it once, point it at their feed, and forget about it until they need to check subscriber counts or add a new feed.

### Subscriber

A reader who follows a personal website or blog and prefers to receive new posts by email rather than checking the site or using a feed reader. They interact with feedmail only through the subscribe form, verification email, and newsletter emails — they never see the admin interface and may not know feedmail exists. They expect a quick, trustworthy subscribe flow, reliable delivery, and easy one-click unsubscribe.

---

## Planned

### Release: Admin Console (Functional)

A plain HTML admin console with all management functionality and a guided first-time setup flow — completing the browser-based management story.

| #   | Feature                                                                      | Description                                                                                                                         | GUID                                   |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | [first-time-setup-flow](./admin-console-functional/first-time-setup-flow.md) | Dashboard empty state guides operators through first channel and feed creation entirely within the browser                          | `CFD3690C-0462-4FBB-BA94-4EB2F05B6402` |

### Release: Admin Console (Styled)

HTMX interactions, CUBE CSS design system, responsive sidebar layout, dark mode, and visual polish for all admin and auth pages.

| #   | Feature                                                                | Description                                                                                                             | GUID                                   |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 2   | [admin-console-styled](./admin-console-styled/admin-console-styled.md) | HTMX-powered interactions, CUBE CSS with Every Layout primitives, fluid responsive design, dark mode, auth page styling | `D04F43C0-AF8F-4CDA-B9ED-4E9C1D3ACA1B` |

### Release: Quick Start

Reliable one-step deployment and drop-in subscribe form widgets so site owners can go from zero to working email subscriptions in minutes. The deployment improvement comes first because distribution content ("here's how to add email subscriptions to your site") needs a flawless setup experience behind it. SSG selection based on [CloudCannon's top SSGs for 2025](https://cloudcannon.com/blog/the-top-five-static-site-generators-for-2025-and-when-to-use-them/) and [Kinsta's top SSGs for 2026](https://kinsta.com/blog/static-site-generator/), filtered for personal blog relevance.

| #   | Feature                                                                 | Description                                                                                                                  | GUID                                   |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 3   | [one-line-deploy](./quick-start/one-line-deploy.md)                     | Hardened, idempotent setup script that provisions all infrastructure via direct Cloudflare and Resend API calls, deploys workers, seeds credentials, and gates on Resend domain verification | `F39F0C1C-64AC-4F37-AB29-DD16D53307F3` |
| 4   | [alternative-deploy-paths](./quick-start/alternative-deploy-paths.md)   | Alternative onboarding paths (Cloudflare Deploy Button, GitHub Template) for users who prefer browser-based or CI-driven workflows | `5D3610BF-55EA-4380-82B4-FBCAA8AD7CF9` |
| 5   | [subscribe-widget-html](./quick-start/subscribe-widget-html.md)         | Generic HTML/JS subscribe form snippet that works on any site with no framework dependency                                   | `CB3C539D-2E07-430E-845C-14B909E8850E` |
| 6   | [subscribe-widget-hugo](./quick-start/subscribe-widget-hugo.md)         | Hugo partial/shortcode for embedding the feedmail subscribe form                                                             | `C659F727-3A89-4D58-A570-ED320883665B` |
| 7   | [subscribe-widget-jekyll](./quick-start/subscribe-widget-jekyll.md)     | Jekyll include for embedding the feedmail subscribe form                                                                     | `8C1C41E5-267E-423A-9A2C-D4991AB94570` |
| 8   | [subscribe-widget-eleventy](./quick-start/subscribe-widget-eleventy.md) | Eleventy shortcode/plugin for embedding the feedmail subscribe form                                                          | `21B22062-FC7C-44A8-8B9F-91F5F40FD4EF` |
| 9  | [subscribe-widget-astro](./quick-start/subscribe-widget-astro.md)       | Astro component for embedding the feedmail subscribe form                                                                    | `9DE93ABB-0DFF-4637-98CE-7A08B7A65A0D` |

### Release: Admin Console Enhancements

Paginated subscriber lists, in-browser configuration editing, credential management, and operational housekeeping (session lifecycle, credential source cleanup) grouped into a single release of internal improvements.

| #   | Feature                                                                                            | Description                                                                                                                                               | GUID                                   |
| --- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 10  | [admin-console-enhancements](./admin-console-enhancements/admin-console-enhancements.md)           | Server-side subscriber list pagination, site config editing, admin email change with verification, admin API key regeneration, and Resend API key editing | `0921300D-83E6-4423-AE32-DFB5ED5BD88A` |
| 11  | [auth-session-cleanup](./admin-console-enhancements/auth-session-cleanup.md)                       | Probabilistic cleanup of expired auth sessions and magic link tokens, with a shared utility that also refactors rate limit cleanup                        | `E0AC5C7B-3792-44B4-89EB-FCC3B89050C4` |
| 12  | [remove-credential-env-fallbacks](./admin-console-enhancements/remove-credential-env-fallbacks.md) | Removes env-var fallback for ADMIN_API_KEY and RESEND_API_KEY so the D1 credentials table is the single source of truth                                   | `5CBF07F1-6FFE-4FE0-9DF6-221398A0EFDC` |
| 13  | [rolling-sessions](./admin-console-enhancements/rolling-sessions.md)                               | Rolling session expiry (24hr inactivity timeout) with a 7-day absolute cap, replacing the current fixed 24-hour session lifetime                          | `26E123A5-1D72-47C8-9E62-AB14F77E55D2` |

### Release: Migration

Import tools so users of existing newsletter services can bring their subscriber list to feedmail without starting from scratch. Platform selection based on [Marketer Milk's newsletter platforms for 2026](https://www.marketermilk.com/blog/best-newsletter-platforms), [Inbox Collective's indie newsletter ESP comparison](https://inboxcollective.com/aweber-beehiiv-convertkit-ghost-mailchimp-substack-which-is-the-right-esp-for-your-indie-newsletter/), and [Reddit recommendations for small-audience newsletter tools](https://websiteseostats.com/6-newsletter-tools-reddit-says-are-underrated-but-powerful-for-small-audiences/), filtered for personal blog relevance.

| #   | Feature                                                 | Description                                                                                       | GUID                                   |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 14  | [migrate-core](./migration/migrate-core.md)             | Core migration framework with subscriber import, validation, deduplication, and verification flow | `56CA7165-1B19-4712-ACCA-3847AD552ACE` |
| 15  | [migrate-buttondown](./migration/migrate-buttondown.md) | Import subscribers from a Buttondown export                                                       | `4FBDF5E9-7D3D-48E6-8855-CB746B654EF9` |
| 16  | [migrate-mailchimp](./migration/migrate-mailchimp.md)   | Import subscribers from a Mailchimp audience export                                               | `02C7344A-5C06-4A99-B348-FD07FDBC7219` |
| 17  | [migrate-ghost](./migration/migrate-ghost.md)           | Import subscribers from a Ghost member/newsletter export                                          | `FBBAA31E-4397-4841-8026-7E75CEA5C30E` |
| 18  | [migrate-kit](./migration/migrate-kit.md)               | Import subscribers from a Kit (formerly ConvertKit) export                                        | `910B6DD6-8567-40B1-99E6-2CE029E2D4B0` |
| 19  | [migrate-mailerlite](./migration/migrate-mailerlite.md) | Import subscribers from a MailerLite export                                                       | `AB244D19-86FB-47A5-974C-FAEB85970FA7` |

---

## Shipped

| Feature                                                                             | Description                                                                                                                                                      | GUID                                   | PR  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --- |
| [email-deliverability-improvements](./shipped/email-deliverability-improvements.md) | Added List-Unsubscribe headers to verification emails and standardised the email footer with an optional company name/address block                              | `33B92369-DA50-4B57-8CD7-87CC1CBF37D2` | #19 |
| [channel-config-restructuring](./shipped/channel-config-restructuring.md)           | Restructured config from SITES/BASE_URL to CHANNELS/DOMAIN with fromUser email local parts, structured feed objects, and startup config validation               | `9C58F879-27FF-48F6-B7A4-D2D3F53F5E71` | #22 |
| [db-backed-configuration](./shipped/db-backed-configuration.md)                     | Moves channel/site config from wrangler.toml env vars to D1, with a full admin API for creating and managing channels, feeds, and rate limit settings at runtime | `DCD5EDC1-13F5-40D9-A12B-BA27EE9C1DA9` | #26 |
| [open-source-packaging](./shipped/open-source-packaging.md)                         | Enables self-hosting via a curl-installable bootstrap script and interactive setup wizard, a sanitised wrangler.toml template, and an updated README             | `3C2D77DC-8AB5-439C-B1C8-FB6BB636A83F` | #27 |
| [admin-auth-magic-link](./shipped/admin-auth-magic-link.md)                         | Establishes the admin Worker, session management, and magic link email login with DB-stored credentials (admin email, API keys, Resend key)                      | `233E72F0-C4B3-41A8-8A4E-5AEC156C456E` | #38 |
| [trailing-slash-normalization](./shipped/trailing-slash-normalization.md)           | Fixes routing failures from trailing slashes and bare `/admin` by normalizing paths early in both workers                                                        | `718F6B2C-024C-4E3B-8C65-A75C078EDDD9` | #41 |
| [admin-auth-passkey](./shipped/admin-auth-passkey.md)                               | Adds passkey (WebAuthn) authentication as the primary login method, with magic link as fallback                                                                  | `FF8F870D-4FD8-491F-9DF2-A4D5E332BE22` | #42 |
| [admin-console-functional](./shipped/admin-console-functional.md)                   | Plain HTML forms covering dashboard, channel/feed CRUD, subscriber list, passkey management, confirmations, and errors                                           | `5A963535-83B6-4BA9-AB36-0A8C4F29E7BC` | #46 |
| [admin-rate-limit-bypass](./shipped/admin-rate-limit-bypass.md)                     | Exempts authenticated service binding requests from API Worker rate limiting so active admin console usage is never throttled                                    | `958A5E88-B87B-45D8-991E-3F236EF869A3` | #50 |
