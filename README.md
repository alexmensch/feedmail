# feedmail

[![codecov](https://codecov.io/gh/alexmensch/feedmail/branch/master/graph/badge.svg)](https://codecov.io/gh/alexmensch/feedmail)

An open-source RSS-to-email microservice that runs on Cloudflare Workers. Monitor RSS/Atom feeds for new items and email them to subscribers automatically.

## Features

- **RSS & Atom support** — Parses both RSS 2.0 and Atom feeds
- **Double opt-in** — Email verification with rate limiting and 24-hour token expiry
- **One-click unsubscribe** — RFC 8058 `List-Unsubscribe-Post` headers
- **Multi-site** — Single deployment can serve multiple sites with isolated subscriber lists
- **Multi-feed** — Each site can monitor multiple feed URLs
- **Zero tracking** — No open or click tracking; privacy by default
- **Customizable templates** — Handlebars templates for emails and confirmation pages
- **Admin API** — Subscriber stats and listing endpoints
- **Bot protection** — Cloudflare Turnstile integration on the subscribe endpoint
- **Feed bootstrapping** — First run seeds existing items without sending emails

## Architecture

feedmail runs entirely on Cloudflare's edge platform:

- **Cloudflare Workers** — Handles HTTP requests and cron triggers
- **Cloudflare D1** — Stores subscribers, verification attempts, and sent item history
- **SendGrid** — Sends transactional emails (verification and newsletter)
- **Cloudflare Turnstile** — Bot protection for the subscribe form

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- A [SendGrid](https://sendgrid.com/) account with an API key
- A [Cloudflare](https://cloudflare.com/) account
- A [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) site key and secret key

### 1. Clone and install

```bash
git clone https://github.com/alexmensch/feedmail.git
cd feedmail
npm install
```

### 2. Create the D1 database

```bash
wrangler d1 create feedmail
```

Copy the `database_id` from the output into `wrangler.toml`.

### 3. Run migrations

```bash
npm run db:migrate        # Remote (production)
npm run db:migrate:local  # Local dev
```

### 4. Configure sites

Edit the `SITES` variable in `wrangler.toml`:

```toml
[vars]
SITES = '''
[
  {
    "id": "my-site",
    "url": "https://example.com",
    "name": "My Site",
    "fromEmail": "hello@example.com",
    "fromName": "My Site Newsletter",
    "corsOrigins": ["https://example.com"],
    "feeds": ["https://example.com/feed.xml"]
  }
]
'''
```

Each site object requires:

| Field | Description |
|---|---|
| `id` | Unique identifier (sent by the subscribe form) |
| `url` | Site URL (used in templates) |
| `name` | Display name (used in email subjects and templates) |
| `fromEmail` | Sender email address (must be verified in SendGrid) |
| `fromName` | Sender display name |
| `corsOrigins` | Allowed origins for the subscribe endpoint |
| `feeds` | Array of RSS/Atom feed URLs to monitor |

### 5. Set secrets

```bash
wrangler secret put SENDGRID_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put ADMIN_API_KEY
```

### 6. Deploy

```bash
npm run deploy
```

### 7. Set up your custom domain (optional)

Update the `[[routes]]` section in `wrangler.toml` to use your domain, then redeploy.

## Configuration

### Environment variables (`wrangler.toml [vars]`)

| Variable | Default | Description |
|---|---|---|
| `SITES` | — | JSON array of site configurations (required) |
| `VERIFY_MAX_ATTEMPTS` | `"5"` | Max verification emails per rolling window |
| `VERIFY_WINDOW_HOURS` | `"24"` | Rolling window duration in hours |

### Secrets (`wrangler secret put`)

| Secret | Description |
|---|---|
| `SENDGRID_API_KEY` | SendGrid API key for sending emails |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |
| `ADMIN_API_KEY` | Bearer token for admin and send endpoints |

## API Reference

### Public endpoints

#### `POST /api/subscribe`

Subscribe an email address to a site's newsletter.

**Request body:**

```json
{
  "email": "user@example.com",
  "siteId": "my-site",
  "turnstileToken": "<token from Turnstile widget>"
}
```

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

Manually trigger feed checking and email sending. Optionally specify a site:

```json
{
  "siteId": "my-site"
}
```

**Response:**

```json
{
  "sent": 3,
  "items": [
    { "title": "Post Title", "recipients": 3, "siteId": "my-site" }
  ],
  "seeded": false
}
```

#### `GET /api/admin/stats?siteId=<siteId>`

Get subscriber and sent item statistics for a site.

**Response:**

```json
{
  "siteId": "my-site",
  "subscribers": { "total": 50, "verified": 45, "pending": 3, "unsubscribed": 2 },
  "sentItems": { "total": 12, "lastSentAt": "2026-02-27T10:00:00Z" },
  "feeds": ["https://example.com/feed.xml"]
}
```

#### `GET /api/admin/subscribers?siteId=<siteId>&status=<status>`

List subscribers for a site. Optional `status` filter (`pending`, `verified`, `unsubscribed`).

**Response:**

```json
{
  "siteId": "my-site",
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

## Cron Behaviour

feedmail runs on a configurable cron schedule (default: every 6 hours). On each trigger:

1. Fetches all configured RSS/Atom feeds
2. **Bootstrapping:** If a feed has never been seen before, all current items are marked as "already sent" without emailing anyone — this prevents a flood of old content on first setup
3. Identifies new items by comparing feed item IDs against D1 records
4. Sends each new item as a separate email to all verified subscribers
5. Records sent items in D1

## Templates

Email and page templates use [Handlebars](https://handlebarsjs.com/) and are located in `src/templates/`:

| Template | Purpose |
|---|---|
| `newsletter.hbs` | HTML email for new feed items |
| `newsletter.txt.hbs` | Plain text email for new feed items |
| `verification-email.hbs` | Verification email sent on subscribe |
| `verify-page.hbs` | "You're subscribed" confirmation page |
| `unsubscribe-page.hbs` | "You've been unsubscribed" confirmation page |
| `error-page.hbs` | Error page (invalid/expired tokens) |

Customize these files before deploying to match your branding.

### Available Handlebars helpers

- `{{formatDate date}}` — Formats a date string as "27 February 2026"
- `{{currentYear}}` — Returns the current year

## Subscribe Form Example

Add a subscribe form to your website that POSTs to the feedmail API:

```html
<form id="subscribe-form">
  <input type="email" name="email" placeholder="Your email" required />
  <div class="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY"></div>
  <button type="submit">Subscribe</button>
  <p id="subscribe-message" aria-live="polite"></p>
</form>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>
  document.getElementById('subscribe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById('subscribe-message');

    const response = await fetch('https://your-feedmail-domain/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email.value,
        siteId: 'your-site-id',
        turnstileToken: turnstile.getResponse(),
      }),
    });

    const data = await response.json();
    msg.textContent = data.message;
    if (data.success) turnstile.reset();
  });
</script>
```

## Multi-site Setup

feedmail supports multiple sites in a single deployment. Each site has its own subscriber list, feed URLs, sender identity, and CORS origins.

Add additional site objects to the `SITES` array in `wrangler.toml`:

```toml
[vars]
SITES = '''
[
  {
    "id": "site-a",
    "url": "https://site-a.com",
    "name": "Site A",
    "fromEmail": "newsletter@site-a.com",
    "fromName": "Site A",
    "corsOrigins": ["https://site-a.com"],
    "feeds": ["https://site-a.com/feed.xml"]
  },
  {
    "id": "site-b",
    "url": "https://site-b.com",
    "name": "Site B",
    "fromEmail": "newsletter@site-b.com",
    "fromName": "Site B",
    "corsOrigins": ["https://site-b.com"],
    "feeds": ["https://site-b.com/rss", "https://site-b.com/podcast.xml"]
  }
]
'''
```

## Development

```bash
# Start local dev server
npm run dev

# Apply migrations locally
npm run db:migrate:local
```

## License

[AGPL-3.0](LICENSE)
