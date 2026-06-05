# Roadmap

> Active and planned work is tracked in **beads**, not in this file. This document
> keeps the product narrative — overview, target users, and the rationale behind
> each release. For the live feature list, dependency graph, and status, use
> `bd ready`, `bd list`, and the epics named under [Releases](#releases). Shipped
> features are recorded as closed beads (`bd list --status=closed`) and in
> `git log` / PR history.

## Overview

feedmail is a free, self-hosted RSS-to-email service for personal website owners. It monitors RSS/Atom feeds and emails new posts to verified subscribers via Resend, running entirely on Cloudflare Workers. Existing newsletter platforms either charge for RSS-to-email (Buttondown's RSS feature is a $9/month add-on) or are far more complex than a personal site needs. feedmail exists so that anyone with a blog and an RSS feed can offer email subscriptions without paying for or depending on a third-party service. A single deployment supports multiple channels, each with its own subscriber list, feeds, and sender identity.

The project reached 1.0.0 with a solid core: multi-channel support, per-subscriber personalisation, strict security layering, email deliverability signals, and a well-validated channel configuration schema. The "Open Source Ready" release (2.1.0) made feedmail genuinely distributable: DB-backed configuration provides runtime admin API management, and open-source packaging enables anyone with a Cloudflare account to self-host with a single curl command. Admin authentication followed with magic link email login and passkey (WebAuthn) support, and a functional admin console now provides browser-based management of channels, feeds, subscribers, and settings.

The current focus is adding visual polish to the admin console and all public-facing HTML pages using Pico CSS, then shifting to distribution enablement. The styled interface is intentionally kept before distribution work because a baseline level of visual polish is necessary for people evaluating feedmail to trust it as a serious tool, but the scope of styling is deliberately constrained to Pico's defaults to avoid over-polishing before validating with real users.

After the styled interface, the Quick Start release prioritises lowering the barrier to adoption. A hardened, idempotent setup script provisions all infrastructure via direct Cloudflare and Resend API calls, with no external toolchain dependencies — making the deploy-to-running experience reliable and one-step. Alternative deployment paths (Cloudflare Deploy Button, GitHub Template) are sequenced after the primary script for users who prefer browser-based or CI-driven workflows. Drop-in subscribe form widgets for popular static site generators follow. Together, these create the foundation for distribution: a blog post can walk someone from deployment to a working subscribe form on their site. The Quick Start release is sequenced before console enhancements because distribution enablement is more strategically urgent than power-user features — the product's biggest open risk is that nobody outside its creator has used it.

All settings, credentials, and application state are stored in D1 and changeable at runtime. Only the `DOMAIN` env var remains as a Wrangler configuration item. Features are sequenced so that each step delivers testable, working functionality to the site owner. Console enhancements (pagination, config editing, credential management) and operational housekeeping (session cleanup, rolling sessions) are grouped into a single release after Quick Start. Beyond the console, a Migration release with import tools for moving subscriber lists from Buttondown, Mailchimp, Ghost, Kit (ConvertKit), and MailerLite completes the planned roadmap.

---

## Target Users

### Personal website owner

A developer or technically inclined hobbyist who runs a personal website — typically a blog or digital garden built with a static site generator like Jekyll, Eleventy, or Hugo, and deployed on their own terms. They write because they want a corner of the internet to share their thoughts, not to build a media business. They already have an RSS feed (most static site generators produce one by default) and want to offer email subscriptions to readers who prefer inbox delivery over feed readers. Existing newsletter services either charge for RSS-to-email functionality (Buttondown charges $9/month) or are overkill for a personal site. They want something free, self-hosted, and simple — deploy it once, point it at their feed, and forget about it until they need to check subscriber counts or add a new feed.

### Subscriber

A reader who follows a personal website or blog and prefers to receive new posts by email rather than checking the site or using a feed reader. They interact with feedmail only through the subscribe form, verification email, and newsletter emails — they never see the admin interface and may not know feedmail exists. They expect a quick, trustworthy subscribe flow, reliable delivery, and easy one-click unsubscribe.

---

## Releases

Each release below is an epic in beads. The next item up is **Admin Console Pico CSS** (`bd show feedmail-8b4`), which adds visual styling to every HTML page and supersedes the earlier CUBE CSS styling work.

### Quick Start — `bd show feedmail-0oq`

Reliable one-step deployment and drop-in subscribe form widgets so site owners can go from zero to working email subscriptions in minutes. The deployment improvement comes first because distribution content ("here's how to add email subscriptions to your site") needs a flawless setup experience behind it. SSG selection based on [CloudCannon's top SSGs for 2025](https://cloudcannon.com/blog/the-top-five-static-site-generators-for-2025-and-when-to-use-them/) and [Kinsta's top SSGs for 2026](https://kinsta.com/blog/static-site-generator/), filtered for personal blog relevance. Covers the hardened one-line-deploy script, alternative deploy paths, and generic-HTML + Hugo/Jekyll/Eleventy/Astro subscribe widgets.

### Admin Console Enhancements — `bd show feedmail-abh`

Paginated subscriber lists, in-browser configuration editing, credential management, and operational housekeeping (session lifecycle, credential-source cleanup) grouped into a single release of internal improvements. Sequenced after Quick Start because distribution enablement is more strategically urgent than power-user features.

### Migration — `bd show feedmail-xv8`

Import tools so users of existing newsletter services can bring their subscriber list to feedmail without starting from scratch. `migrate-core` is the framework all platform adapters build on. Platform selection based on [Marketer Milk's newsletter platforms for 2026](https://www.marketermilk.com/blog/best-newsletter-platforms), [Inbox Collective's indie newsletter ESP comparison](https://inboxcollective.com/aweber-beehiiv-convertkit-ghost-mailchimp-substack-which-is-the-right-esp-for-your-indie-newsletter/), and [Reddit recommendations for small-audience newsletter tools](https://websiteseostats.com/6-newsletter-tools-reddit-says-are-underrated-but-powerful-for-small-audiences/), filtered for personal blog relevance. Adapters: Buttondown, Mailchimp, Ghost, Kit (ConvertKit), MailerLite.

### Distribution & Validation — `bd show feedmail-4k4`

Cross-cutting work surfaced from the [strategy](./STRATEGY.md) risks: first blog post + SSG-community share, platform-reach research, real-user validation, an Amazon SES email-provider option, and ongoing community monitoring. feedmail's biggest open risk is that nobody outside its creator has used it.
