# feedmail

[![codecov](https://codecov.io/gh/alexmensch/feedmail/branch/master/graph/badge.svg)](https://codecov.io/gh/alexmensch/feedmail)

An open-source RSS-to-email microservice that runs on Cloudflare Workers. Monitor RSS/Atom feeds for new items and email them to subscribers automatically.

## Features

- **RSS & Atom support** — Parses both RSS 2.0 and Atom feeds
- **Double opt-in** — Email verification with rate limiting and 24-hour token expiry
- **One-click unsubscribe** — RFC 8058 `List-Unsubscribe-Post` headers
- **Multi-channel** — Single deployment can serve multiple channels with isolated subscriber lists
- **Multi-feed** — Each channel can monitor multiple named feeds
- **Zero tracking** — No open or click tracking; privacy by default
- **Customizable templates** — Handlebars templates for emails and confirmation pages
- **Admin API** — Runtime config management, subscriber stats, channel/feed CRUD
- **IP rate limiting** — Per-endpoint rolling window rate limiting via D1
- **Bot protection** — Strict input validation with honeypot support, method enforcement with deliberate timeouts
- **Feed bootstrapping** — First run seeds existing items without sending emails
- **Config validation** — Validates all configuration at startup with clear error messages

## Architecture

feedmail runs entirely on Cloudflare's edge platform:

- **Cloudflare Workers** — Handles HTTP requests and cron triggers
- **Cloudflare D1** — Stores subscribers, configuration, sent item history, and rate limits
- **Resend** — Sends transactional emails (verification and newsletter)

## Quick Start

The recommended way to install feedmail is with the automated installer:

```bash
curl -fsSL https://raw.githubusercontent.com/alexmensch/feedmail/master/scripts/install.sh | bash
```

This will check prerequisites, clone the repo, install dependencies, and walk you through an interactive setup wizard that:

1. Creates a Cloudflare D1 database
2. Generates your `wrangler.prod.toml` config
3. Sets your Resend and admin API secrets
4. Runs database migrations
5. Deploys the worker
6. Creates your first channel

### Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`), authenticated via `wrangler login`
- A [Cloudflare](https://cloudflare.com/) account
- A [Resend](https://resend.com/) account with an API key

> **Note:** Resend requires domain verification before you can send from a custom domain. See the [Resend domain verification docs](https://resend.com/docs/dashboard/domains/introduction) to set this up.

## Manual Setup

If you prefer to set up manually instead of using the installer:

### 1. Clone and install

```bash
git clone https://github.com/alexmensch/feedmail.git
cd feedmail
pnpm install
```

### 2. Create the D1 database

```bash
wrangler d1 create feedmail
```

### 3. Create `wrangler.prod.toml`

Copy `wrangler.toml` as a starting point and fill in your values:

```bash
cp wrangler.toml wrangler.prod.toml
```

Edit `wrangler.prod.toml` to set:

- `name` — your worker name
- `database_id` — the ID from step 2
- `DOMAIN` — your domain (bare hostname, no protocol or path)
- Uncomment and configure the `[[routes]]` section if using a custom domain

### 4. Set secrets

```bash
wrangler secret put RESEND_API_KEY --config wrangler.prod.toml
wrangler secret put ADMIN_API_KEY --config wrangler.prod.toml
```

### 5. Deploy

```bash
pnpm run deploy
```

This runs migrations and deploys the worker using `wrangler.prod.toml`.

### 6. Create your first channel

```bash
curl -X POST https://your-worker.workers.dev/api/admin/channels \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-channel",
    "siteUrl": "https://example.com",
    "siteName": "My Site",
    "fromUser": "hello",
    "fromName": "My Site Newsletter",
    "corsOrigins": ["https://example.com"],
    "feeds": [
      {"name": "Blog", "url": "https://example.com/feed.xml"}
    ]
  }'
```

Each channel requires:

| Field         | Description                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `id`          | Unique identifier (sent by the subscribe form)                                 |
| `siteUrl`     | Site URL (used in templates)                                                   |
| `siteName`    | Display name (used in email subjects and templates)                            |
| `fromUser`    | Email local part (e.g. `"hello"`); combined with DOMAIN to form the from-email |
| `fromName`    | Sender display name                                                            |
| `corsOrigins` | Allowed origins for the subscribe endpoint                                     |
| `feeds`       | Array of feed objects, each with `name` and `url`                              |

Optional fields: `replyTo`, `companyName`, `companyAddress`.

## Updating

To update feedmail to the latest version:

```bash
git pull origin master
pnpm install
pnpm run deploy
```

Your `wrangler.prod.toml` is gitignored, so it won't be overwritten by pulls.

## Configuration

### Environment variables (`wrangler.prod.toml [vars]`)

| Variable | Default | Description                                                                        |
| -------- | ------- | ---------------------------------------------------------------------------------- |
| `DOMAIN` | —       | Domain name (e.g. `feedmail.cc`). No protocol, trailing slash, or path. (required) |

All other configuration (channels, feeds, verification limits, rate limits) is stored in D1 and managed via the admin API.

### Secrets (`wrangler secret put`)

| Secret           | Description                               |
| ---------------- | ----------------------------------------- |
| `RESEND_API_KEY` | Resend API key for sending emails         |
| `ADMIN_API_KEY`  | Bearer token for admin and send endpoints |

### IP Rate Limits

Default rate limits per endpoint (configurable via `PATCH /api/admin/config`):

| Endpoint           | Limit       | Window |
| ------------------ | ----------- | ------ |
| `/api/subscribe`   | 10 requests | 1 hour |
| `/api/verify`      | 20 requests | 1 hour |
| `/api/unsubscribe` | 20 requests | 1 hour |
| `/api/send`        | 5 requests  | 1 hour |
| `/api/admin/*`     | 30 requests | 1 hour |

When rate limited, the API returns `429 Too Many Requests` with a `Retry-After` header indicating when the next request will be accepted (with random jitter to prevent thundering herd retries).

## API Reference

### Public endpoints

#### `POST /api/subscribe`

Subscribe an email address to a channel's newsletter.

**Request body:**

```json
{
  "email": "user@example.com",
  "channelId": "my-channel"
}
```

Only `email` and `channelId` fields are accepted. Requests with any additional fields are rejected — this enables invisible honeypot fields in the subscribe form for bot protection.

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Check your email to confirm your subscription."
}
```

Always returns the same response regardless of whether the email is new, already subscribed, or rate limited — no information leakage.

**CORS:** Enabled for configured `corsOrigins`.

#### `GET /api/verify?token=<token>`

Verify a subscriber's email address. Returns an HTML confirmation page.

- Valid token → marks subscriber as verified, returns success page
- Invalid or expired token (24hr) → returns error page

#### `GET /api/unsubscribe?token=<token>`

Unsubscribe from the newsletter. Returns an HTML confirmation page.

#### `POST /api/unsubscribe?token=<token>`

One-click unsubscribe (RFC 8058). Returns `200 OK`.

### Authenticated endpoints

All authenticated endpoints require an `Authorization: Bearer <ADMIN_API_KEY>` header.

#### `POST /api/send`

Manually trigger feed checking and email sending. Optionally specify a channel:

```json
{
  "channelId": "my-channel"
}
```

**Response:**

```json
{
  "sent": 3,
  "items": [
    { "title": "Post Title", "recipients": 3, "channelId": "my-channel" }
  ],
  "seeded": false
}
```

#### `GET /api/admin/stats?channelId=<channelId>`

Get subscriber and sent item statistics for a channel.

**Response:**

```json
{
  "channelId": "my-channel",
  "subscribers": {
    "total": 50,
    "verified": 45,
    "pending": 3,
    "unsubscribed": 2
  },
  "sentItems": { "total": 12, "lastSentAt": "2026-02-27T10:00:00Z" },
  "feeds": [{ "name": "Blog", "url": "https://example.com/feed.xml" }]
}
```

#### `GET /api/admin/subscribers?channelId=<channelId>&status=<status>`

List subscribers for a channel. Optional `status` filter (`pending`, `verified`, `unsubscribed`).

**Response:**

```json
{
  "channelId": "my-channel",
  "count": 45,
  "subscribers": [
    {
      "email": "user@example.com",
      "status": "verified",
      "created_at": "2026-02-01T00:00:00Z",
      "verified_at": "2026-02-01T00:05:00Z",
      "unsubscribed_at": null
    }
  ]
}
```

#### `GET /api/admin/config`

Get site-level settings (verification limits and rate limits).

#### `PATCH /api/admin/config`

Update site-level settings. Partial updates supported.

```json
{
  "verifyMaxAttempts": 5,
  "verifyWindowHours": 12,
  "rateLimits": {
    "subscribe": { "maxRequests": 20, "windowHours": 1 }
  }
}
```

#### `GET|POST /api/admin/channels`

List all channels (`GET`) or create a new channel (`POST`).

#### `GET|PUT|DELETE /api/admin/channels/{channelId}`

Get, update, or delete a specific channel.

#### `GET|POST /api/admin/channels/{channelId}/feeds`

List feeds for a channel (`GET`) or add a new feed (`POST`).

#### `PUT|DELETE /api/admin/channels/{channelId}/feeds/{feedId}`

Update or delete a specific feed.

## Security

feedmail uses a layered security approach instead of CAPTCHA challenges:

1. **IP rate limiting** — Per-endpoint limits via D1 rolling window counting (see [IP Rate Limits](#ip-rate-limits))
2. **HTTP method enforcement** — Known routes with wrong methods receive a deliberate 10-second delay then 408 timeout, discouraging bot probing. Unknown paths get an immediate 404 with no body.
3. **Strict input validation** — Subscribe endpoint rejects requests with unexpected fields, enabling invisible honeypot fields in the form
4. **Verification email limits** — Per-subscriber rolling window limits on verification emails sent
5. **No information leakage** — All subscribe responses are identical regardless of subscriber state

## Cron Behaviour

feedmail runs on a configurable cron schedule (default: every 6 hours). On each trigger:

1. Fetches all configured RSS/Atom feeds
2. **Bootstrapping:** If a feed has never been seen before, all current items are marked as "already sent" without emailing anyone — this prevents a flood of old content on first setup
3. Identifies new items by comparing feed item IDs against D1 records
4. Sends each new item as a separate email to all verified subscribers
5. Records sent items in D1

## Templates

Email and page templates use [Handlebars](https://handlebarsjs.com/) and are located in `src/templates/`:

| Template                    | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `newsletter.hbs`            | HTML email for new feed items                              |
| `newsletter.txt.hbs`        | Plain text email for new feed items                        |
| `verification-email.hbs`    | Verification email sent on subscribe                       |
| `verify-page.hbs`           | "You're subscribed" confirmation page                      |
| `unsubscribe-page.hbs`      | "You've been unsubscribed" confirmation page               |
| `error-page.hbs`            | Error page (invalid/expired tokens)                        |
| `partials/email-footer.hbs` | Shared email footer (copyright, unsubscribe, company info) |

Customize these files before deploying to match your branding.

### Available Handlebars helpers

- `{{formatDate date}}` — Formats a date string as "27 February 2026"
- `{{currentYear}}` — Returns the current year

## Subscribe Form Example

Add a subscribe form to your website that POSTs to the feedmail API. The form should only send `email` and `channelId` — any extra fields will be rejected (which is useful for adding an invisible honeypot field for bot detection).

```html
<form id="subscribe-form">
  <input type="email" name="email" placeholder="Your email" required />
  <!-- Honeypot field: hidden from real users, bots will fill it -->
  <input
    type="text"
    name="website"
    style="display: none"
    tabindex="-1"
    autocomplete="off"
  />
  <button type="submit">Subscribe</button>
  <p id="subscribe-message" aria-live="polite"></p>
</form>

<script>
  document
    .getElementById("subscribe-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const msg = document.getElementById("subscribe-message");

      // If honeypot field is filled, silently "succeed" without submitting
      if (form.website.value) {
        msg.textContent = "Check your email to confirm your subscription.";
        return;
      }

      const response = await fetch(
        "https://your-feedmail-domain/api/subscribe",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email.value,
            channelId: "your-channel-id"
          })
        }
      );

      const data = await response.json();
      msg.textContent = data.message;
    });
</script>
```

## Multi-channel Setup

feedmail supports multiple channels in a single deployment. Each channel has its own subscriber list, feeds, sender identity, and CORS origins.

Create additional channels via the admin API:

```bash
curl -X POST https://yourdomain.com/api/admin/channels \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "channel-b",
    "siteUrl": "https://site-b.com",
    "siteName": "Site B",
    "fromUser": "newsletter",
    "fromName": "Site B",
    "corsOrigins": ["https://site-b.com"],
    "feeds": [
      {"name": "Blog", "url": "https://site-b.com/rss"},
      {"name": "Podcast", "url": "https://site-b.com/podcast.xml"}
    ]
  }'
```

## Development

```bash
pnpm run dev              # Start local dev server
pnpm run db:migrate:local # Apply migrations locally
pnpm run test             # Run tests
pnpm run test:coverage    # Run tests with coverage
```

## License

[AGPL-3.0](LICENSE)
