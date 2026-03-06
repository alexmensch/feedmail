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
  read -rp "Domain (bare hostname, e.g. feedmail.cc): " DOMAIN
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
D1_OUTPUT=$(wrangler d1 create "$WORKER_NAME" 2>&1) || {
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
cat > wrangler.prod.toml <<EOF
name = "$WORKER_NAME"
main = "src/index.js"
compatibility_date = "2026-02-27"
compatibility_flags = ["nodejs_compat"]
upload_source_maps = true

[build]
command = "node scripts/precompile-templates.mjs"

[triggers]
crons = ["0 */6 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "$WORKER_NAME"
database_id = "$DATABASE_ID"

# Uncomment and configure routes for custom domain:
# [[routes]]
# pattern = "$DOMAIN/api/*"
# zone_name = "$DOMAIN"

[vars]
DOMAIN = "$DOMAIN"

# Secrets (set via \`wrangler secret put\`):
# RESEND_API_KEY
# ADMIN_API_KEY

[observability.logs]
enabled = true
EOF

echo "  Created wrangler.prod.toml"
echo ""

# --- Set secrets (R11) ---

echo "Setting secrets ..."
echo ""

read -rsp "Resend API key: " RESEND_KEY
echo ""
echo "$RESEND_KEY" | wrangler secret put RESEND_API_KEY --config wrangler.prod.toml || {
  echo "Error: Failed to set RESEND_API_KEY."
  exit 1
}

echo ""
read -rsp "Admin API key: " ADMIN_KEY
echo ""
echo "$ADMIN_KEY" | wrangler secret put ADMIN_API_KEY --config wrangler.prod.toml || {
  echo "Error: Failed to set ADMIN_API_KEY."
  exit 1
}

echo ""

# --- Run migrations (R12) ---

echo "Running D1 migrations ..."
wrangler d1 migrations apply "$WORKER_NAME" --remote --config wrangler.prod.toml || {
  echo "Error: Migrations failed."
  exit 1
}

echo ""

# --- Deploy worker (R13) ---

echo "Deploying worker ..."
DEPLOY_OUTPUT=$(wrangler deploy --config wrangler.prod.toml 2>&1) || {
  echo "Error: Deployment failed."
  echo "$DEPLOY_OUTPUT"
  exit 1
}

echo "$DEPLOY_OUTPUT"

# Parse workers.dev URL from deploy output
WORKERS_DEV_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[^ ]*workers\.dev[^ ]*' | head -1) || true

echo ""

# --- Confirm API URL (R14) ---

while true; do
  if [ -n "${WORKERS_DEV_URL:-}" ]; then
    read -rp "API base URL for channel setup [$WORKERS_DEV_URL]: " API_URL
    API_URL="${API_URL:-$WORKERS_DEV_URL}"
  else
    read -rp "API base URL for channel setup: " API_URL
    if [ -z "$API_URL" ]; then
      echo "  URL is required."
      continue
    fi
  fi
  # Strip trailing slash
  API_URL="${API_URL%/}"
  break
done

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

# Build JSON payload — optional fields included only if provided
JSON_PAYLOAD="{"
JSON_PAYLOAD="$JSON_PAYLOAD\"id\":\"$CHANNEL_ID\""
JSON_PAYLOAD="$JSON_PAYLOAD,\"siteName\":\"$SITE_NAME\""
JSON_PAYLOAD="$JSON_PAYLOAD,\"siteUrl\":\"$SITE_URL\""
JSON_PAYLOAD="$JSON_PAYLOAD,\"fromUser\":\"$FROM_USER\""
JSON_PAYLOAD="$JSON_PAYLOAD,\"fromName\":\"$FROM_NAME\""
JSON_PAYLOAD="$JSON_PAYLOAD,\"corsOrigins\":[\"$CORS_ORIGIN\"]"
JSON_PAYLOAD="$JSON_PAYLOAD,\"feeds\":[{\"name\":\"$FEED_NAME\",\"url\":\"$FEED_URL\"}]"

if [ -n "$REPLY_TO" ]; then
  JSON_PAYLOAD="$JSON_PAYLOAD,\"replyTo\":\"$REPLY_TO\""
fi
if [ -n "$COMPANY_NAME" ]; then
  JSON_PAYLOAD="$JSON_PAYLOAD,\"companyName\":\"$COMPANY_NAME\""
fi
if [ -n "$COMPANY_ADDRESS" ]; then
  JSON_PAYLOAD="$JSON_PAYLOAD,\"companyAddress\":\"$COMPANY_ADDRESS\""
fi

JSON_PAYLOAD="$JSON_PAYLOAD}"

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
echo "Your feedmail worker is deployed and ready."
echo "Add a subscribe form to your site that POSTs to: $API_URL/api/subscribe"
echo ""
echo "To add more channels or feeds, use the admin API."
echo "See the README for details."
