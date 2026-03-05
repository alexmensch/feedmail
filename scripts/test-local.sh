#!/bin/bash
#
# Walk through the full subscribe → verify → send flow against the local dev server.
#
# Prerequisites:
#   1. pnpm run dev:feed   (serves test feed fixtures on port 8888)
#   2. pnpm run dev:test   (starts wrangler with test config on port 8787)
#   3. pnpm run db:migrate:local   (apply migrations to local D1)
#
# Usage:
#   ./scripts/test-local.sh <email>

set -euo pipefail

BASE="http://localhost:8787"
SITE="test"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <email>"
  echo ""
  echo "Walks through the full subscribe → verify → send flow against"
  echo "the local dev server (pnpm run dev:test)."
  echo ""
  echo "Prerequisites:"
  echo "  1. pnpm run dev:feed       (serves feed fixtures on port 8888)"
  echo "  2. pnpm run dev:test       (starts wrangler on port 8787)"
  echo "  3. pnpm run db:migrate:local  (apply migrations)"
  exit 1
fi

EMAIL="$1"

# Read ADMIN_API_KEY from .dev.vars
if [ ! -f .dev.vars ]; then
  echo "Error: .dev.vars not found. Create it with ADMIN_API_KEY=<value>"
  exit 1
fi

API_KEY=$(grep -E '^ADMIN_API_KEY=' .dev.vars | cut -d'=' -f2-)

if [ -z "$API_KEY" ]; then
  echo "Error: ADMIN_API_KEY not found in .dev.vars"
  exit 1
fi

echo "=== Resetting local database ==="
echo "This will DELETE all data from the local D1 database (subscribers,"
echo "verification_attempts, sent_items, subscriber_sends, rate_limits)."
echo ""
read -rp "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi
npx wrangler d1 execute feedmail --local --command \
  "DELETE FROM subscribers; DELETE FROM verification_attempts; DELETE FROM sent_items; DELETE FROM subscriber_sends; DELETE FROM rate_limits;"
echo ""

echo "=== Seeding feeds (bootstrapping existing items) ==="
curl -s -X POST "$BASE/api/send" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"siteId\": \"$SITE\"}" | python3 -m json.tool
echo ""

echo "=== Subscribing $EMAIL to site '$SITE' ==="
curl -s -X POST "$BASE/api/subscribe" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"siteId\": \"$SITE\"}" | python3 -m json.tool
echo ""

echo "=== Check your email for the verification link and click it ==="
read -rp "Press Enter when done..."
echo ""

# Mark feed items as unsent so the next send picks them up, but keep a
# seed marker row per feed so isFeedSeeded() still returns true (prevents
# re-bootstrapping instead of sending).
echo "=== Resetting items for re-send ==="
npx wrangler d1 execute feedmail --local --command "
  DELETE FROM sent_items;
  DELETE FROM subscriber_sends;
  INSERT OR IGNORE INTO sent_items (item_id, feed_url, title, recipient_count)
    VALUES ('__seed__', 'http://localhost:8888/feed.rss', 'seed marker', 0);
  INSERT OR IGNORE INTO sent_items (item_id, feed_url, title, recipient_count)
    VALUES ('__seed__', 'http://localhost:8888/feed.atom', 'seed marker', 0);
"
echo ""

echo "=== Triggering send for site '$SITE' ==="
curl -s -X POST "$BASE/api/send" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"siteId\": \"$SITE\"}" | python3 -m json.tool
echo ""

echo "=== Done. Check your email for the newsletter. ==="
