#!/usr/bin/env bash
#
# feedmail setup wizard
#
# Interactive setup that creates a D1 database, generates wrangler.prod.toml,
# sets secrets, runs migrations, deploys the worker, and creates the first
# channel via the admin API.
#
# Typically called by install.sh, but can be run standalone from the repo root.

set -euo pipefail

# Ensure we're running from the repo root
cd "$(dirname "$0")/.."

WRANGLER="pnpm exec wrangler"

# --- Verify wrangler is available and authenticated ---

if ! $WRANGLER -v &>/dev/null; then
  echo "Error: wrangler not found. Run 'pnpm install' first."
  exit 1
fi

if ! $WRANGLER whoami &>/dev/null; then
  echo "Error: wrangler is not authenticated. Run: pnpm exec wrangler login"
  exit 1
fi

echo ""
echo "=== feedmail setup ==="
echo ""

# --- Existing config guard (R7) ---

if [ -f wrangler.prod.toml ]; then
  read -rp "wrangler.prod.toml already exists. Overwrite? [y/N] " OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 0
  fi
  echo ""
fi

# --- Collect infrastructure config (R8) ---

read -rp "Worker name [feedmail]: " WORKER_NAME
WORKER_NAME="${WORKER_NAME:-feedmail}"

while true; do
  read -rp "Domain for emails and API (bare hostname, e.g. feedmail.cc): " DOMAIN
  if [ -z "$DOMAIN" ]; then
    echo "  Domain is required."
    continue
  fi
  if [[ "$DOMAIN" == *"://"* ]]; then
    echo "  Domain must not include protocol (remove https:// or http://)."
    continue
  fi
  if [[ "$DOMAIN" == */ ]]; then
    echo "  Domain must not end with a trailing slash."
    continue
  fi
  if [[ "$DOMAIN" == *"/"* ]]; then
    echo "  Domain must not contain path segments."
    continue
  fi
  break
done

echo ""

# --- Create D1 database (R9) ---

echo "Creating D1 database '$WORKER_NAME' ..."
D1_OUTPUT=$($WRANGLER d1 create "$WORKER_NAME" 2>&1) || {
  echo "Error: Failed to create D1 database."
  echo "$D1_OUTPUT"
  echo ""
  echo "If the name is already taken, delete the existing database or choose a different worker name."
  exit 1
}

DATABASE_ID=$(echo "$D1_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
if [ -z "$DATABASE_ID" ]; then
  echo "Error: Could not parse database_id from wrangler output:"
  echo "$D1_OUTPUT"
  exit 1
fi

echo "  database_id: $DATABASE_ID"
echo ""

# --- Write wrangler.prod.toml (R10) ---

echo "Writing wrangler.prod.toml ..."
cp wrangler.toml wrangler.prod.toml

# Replace placeholder values with user-provided ones
sed -i '' "s/^name = .*/name = \"$WORKER_NAME\"/" wrangler.prod.toml
sed -i '' "s/YOUR_DATABASE_ID/$DATABASE_ID/" wrangler.prod.toml
sed -i '' "s/YOUR_DOMAIN/$DOMAIN/g" wrangler.prod.toml
sed -i '' "s/^database_name = .*/database_name = \"$WORKER_NAME\"/" wrangler.prod.toml

# Comment out the routes section (deployer uncomments when ready)
sed -i '' 's/^\(\[\[routes\]\]\)/# \1/' wrangler.prod.toml
sed -i '' 's/^pattern = /# pattern = /' wrangler.prod.toml
sed -i '' 's/^zone_name = /# zone_name = /' wrangler.prod.toml

echo "  Created wrangler.prod.toml"

# Update package.json deploy/migrate scripts to use the correct database name
sed -i '' "s/wrangler d1 migrations apply feedmail --remote/wrangler d1 migrations apply $WORKER_NAME --remote/g" package.json

echo ""

# --- Collect secrets (R11a) ---

echo "Setting secrets ..."
echo ""

read -rsp "Resend API key: " RESEND_KEY
echo ""
read -rsp "Admin API key: " ADMIN_KEY
echo ""

echo ""

# --- Run migrations (R12) ---

echo "Running D1 migrations ..."
yes | $WRANGLER d1 migrations apply "$WORKER_NAME" --remote --config wrangler.prod.toml || {
  echo "Error: Migrations failed."
  exit 1
}

echo ""

# --- Deploy worker (R13) ---

echo "Deploying worker ..."
DEPLOY_OUTPUT=$($WRANGLER deploy --config wrangler.prod.toml 2>&1) || {
  echo "Error: Deployment failed."
  echo "$DEPLOY_OUTPUT"
  exit 1
}

echo "$DEPLOY_OUTPUT"

# Parse workers.dev URL from deploy output
WORKERS_DEV_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[^ ]*workers\.dev[^ ]*' | head -1) || true

if [ -z "${WORKERS_DEV_URL:-}" ]; then
  echo "Error: Could not parse workers.dev URL from deploy output."
  exit 1
fi

API_URL="${WORKERS_DEV_URL%/}"

echo ""

# --- Set secrets (R11b) ---

echo "$RESEND_KEY" | $WRANGLER secret put RESEND_API_KEY --config wrangler.prod.toml || {
  echo "Error: Failed to set RESEND_API_KEY."
  exit 1
}

echo "$ADMIN_KEY" | $WRANGLER secret put ADMIN_API_KEY --config wrangler.prod.toml || {
  echo "Error: Failed to set ADMIN_API_KEY."
  exit 1
}

echo ""

# --- Collect required channel config (R15) ---

echo "Configure your first channel:"
echo ""

prompt_required() {
  local VAR_NAME="$1"
  local PROMPT="$2"
  local VALUE=""
  while [ -z "$VALUE" ]; do
    read -rp "$PROMPT: " VALUE
    if [ -z "$VALUE" ]; then
      echo "  This field is required."
    fi
  done
  eval "$VAR_NAME=\"\$VALUE\""
}

prompt_required CHANNEL_ID "Channel ID (unique identifier, e.g. my-blog)"
prompt_required SITE_NAME "Site name (displayed in emails)"

# Site URL — validated during CORS derivation (R17)
prompt_required SITE_URL "Site URL (e.g. https://example.com)"

# From user — reject @ and whitespace
while true; do
  prompt_required FROM_USER "From user (email local part, e.g. hello)"
  if [[ "$FROM_USER" == *"@"* ]] || [[ "$FROM_USER" =~ [[:space:]] ]]; then
    echo "  from-user must not contain '@' or whitespace."
    FROM_USER=""
    continue
  fi
  break
done

prompt_required FROM_NAME "From name (sender display name)"
prompt_required FEED_NAME "Feed name (e.g. Blog)"
prompt_required FEED_URL "Feed URL (e.g. https://example.com/feed.xml)"

echo ""

# --- Collect optional channel config (R16) ---

echo "Optional fields (press Enter to skip):"
echo ""

read -rp "Reply-to email (optional): " REPLY_TO
read -rp "Company name (optional): " COMPANY_NAME
read -rp "Company address (optional): " COMPANY_ADDRESS

echo ""

# --- Derive CORS origin (R17) ---

# Extract origin (scheme + host + port) from site URL
if [[ "$SITE_URL" != *"://"* ]]; then
  echo "Warning: Site URL has no scheme (e.g. https://). Please re-enter."
  while true; do
    read -rp "Site URL (e.g. https://example.com): " SITE_URL
    if [ -z "$SITE_URL" ]; then
      echo "  This field is required."
      continue
    fi
    if [[ "$SITE_URL" != *"://"* ]]; then
      echo "  URL must include a scheme (e.g. https://)."
      continue
    fi
    break
  done
fi

# Extract scheme://host[:port]
CORS_ORIGIN=$(echo "$SITE_URL" | sed -E 's|^(https?://[^/]+).*|\1|')

read -rp "CORS origin [$CORS_ORIGIN]: " CORS_INPUT
CORS_ORIGIN="${CORS_INPUT:-$CORS_ORIGIN}"

echo ""

# --- Create channel via API (R18) ---

echo "Creating channel '$CHANNEL_ID' ..."

# Build JSON payload using python3 for safe escaping of user input
json_escape() {
  printf '%s' "$1" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()), end="")'
}

JSON_PAYLOAD=$(python3 -c "
import json, sys
data = {
    'id': $(json_escape "$CHANNEL_ID"),
    'siteName': $(json_escape "$SITE_NAME"),
    'siteUrl': $(json_escape "$SITE_URL"),
    'fromUser': $(json_escape "$FROM_USER"),
    'fromName': $(json_escape "$FROM_NAME"),
    'corsOrigins': [$(json_escape "$CORS_ORIGIN")],
    'feeds': [{'name': $(json_escape "$FEED_NAME"), 'url': $(json_escape "$FEED_URL")}],
}
reply_to = $(json_escape "$REPLY_TO")
company_name = $(json_escape "$COMPANY_NAME")
company_address = $(json_escape "$COMPANY_ADDRESS")
if reply_to:
    data['replyTo'] = reply_to
if company_name:
    data['companyName'] = company_name
if company_address:
    data['companyAddress'] = company_address
print(json.dumps(data))
")

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/admin/channels" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo "  Channel '$CHANNEL_ID' created successfully!"
else
  echo "Error: Failed to create channel (HTTP $HTTP_CODE)."
  echo "$BODY"
  exit 1
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Your feedmail worker is deployed and available at:"
echo "  $API_URL"
echo ""
echo "Configuration summary:"
echo "  Worker name:    $WORKER_NAME"
echo "  Domain:         $DOMAIN"
echo "  Channel:        $CHANNEL_ID"
echo "  Site name:      $SITE_NAME"
echo "  Site URL:       $SITE_URL"
echo "  From:           $FROM_USER@$DOMAIN ($FROM_NAME)"
if [ -n "$REPLY_TO" ]; then
  echo "  Reply-to:       $REPLY_TO"
fi
if [ -n "$COMPANY_NAME" ] || [ -n "$COMPANY_ADDRESS" ]; then
  COMPANY_LINE=""
  if [ -n "$COMPANY_NAME" ]; then
    COMPANY_LINE="$COMPANY_NAME"
  fi
  if [ -n "$COMPANY_ADDRESS" ]; then
    if [ -n "$COMPANY_LINE" ]; then
      COMPANY_LINE="$COMPANY_LINE, $COMPANY_ADDRESS"
    else
      COMPANY_LINE="$COMPANY_ADDRESS"
    fi
  fi
  echo "  Company:        $COMPANY_LINE"
fi
echo "  Feed:           $FEED_NAME → $FEED_URL"
echo "  CORS origin:    $CORS_ORIGIN"
echo ""
echo "Next steps:"
echo "  1. Configure DNS routes: edit wrangler.prod.toml to uncomment the"
echo "     [[routes]] section. Set zone_name to your Cloudflare zone (usually"
echo "     the apex domain) so that https://$DOMAIN/api/* is accessible."
echo "     Then redeploy with: pnpm run deploy"
echo "  2. Verify the service is accessible on your domain:"
echo "     curl -s https://$DOMAIN/api/admin/channels \\"
echo "       -H \"Authorization: Bearer <your-admin-key>\" | python3 -m json.tool"
echo "  3. Add a subscribe form to your site that POSTs to:"
echo "     https://$DOMAIN/api/subscribe"
echo "  4. Seed your feed history (prevents sending old items to new subscribers):"
echo "     curl -s -X POST https://$DOMAIN/api/send \\"
echo "       -H \"Authorization: Bearer <your-admin-key>\""
echo "  5. To add more channels or feeds, use the admin API."
echo "     See the README for details."
