#!/usr/bin/env bash
#
# feedmail upgrade
#
# Upgrades an existing feedmail deployment after pulling the latest changes.
# Installs dependencies, runs D1 migrations, and deploys both workers.
#
# Prerequisites:
#   - Run `git pull` on master first
#   - wrangler.prod.toml and wrangler.admin.prod.toml must exist (created by setup.sh)
#
# Usage:
#   pnpm run upgrade
#   # or directly:
#   bash scripts/upgrade.sh

set -euo pipefail

# Ensure we're running from the repo root
cd "$(dirname "$0")/.."

WRANGLER="pnpm exec wrangler"

echo ""
echo "=== feedmail upgrade ==="
echo ""

# --- Pre-flight checks ---

echo "Pre-flight checks:"

# Check prod configs exist
if [ ! -f wrangler.prod.toml ]; then
  echo "  Error: wrangler.prod.toml not found."
  echo "  Run the setup wizard first: bash scripts/setup.sh"
  exit 1
fi
echo "  wrangler.prod.toml ... ok"

if [ ! -f wrangler.admin.prod.toml ]; then
  echo "  Error: wrangler.admin.prod.toml not found."
  echo "  Run the setup wizard first: bash scripts/setup.sh"
  exit 1
fi
echo "  wrangler.admin.prod.toml ... ok"

# Check wrangler is available
if ! $WRANGLER -v &>/dev/null; then
  echo "  Error: wrangler not found. Run 'pnpm install' first."
  exit 1
fi
echo "  wrangler ... ok"

# Check wrangler is authenticated
if ! $WRANGLER whoami &>/dev/null; then
  echo "  Error: wrangler is not authenticated. Run: pnpm exec wrangler login"
  exit 1
fi
echo "  wrangler auth ... ok"

echo ""

# --- Version info ---

NEW_VERSION=$(node -e "console.log(require('./package.json').version)")

# Try to get the currently deployed version from the latest git tag
CURRENT_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "unknown")

if [ "$CURRENT_VERSION" = "unknown" ]; then
  echo "Deploying v$NEW_VERSION"
elif [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
  echo "Redeploying v$NEW_VERSION"
else
  echo "Upgrading $CURRENT_VERSION → v$NEW_VERSION"
fi

echo ""

# --- Regenerate prod configs from templates ---
#
# The template configs (wrangler.toml, wrangler.admin.toml) may have gained new
# blocks (e.g. [assets]), changed defaults, or removed stale config since the
# prod configs were originally generated. This step rebuilds the prod configs
# from the current templates while preserving deployer-specific values.

echo "Syncing prod configs with templates ..."

# Helper: extract a TOML value by key from a file (handles quoted and unquoted values)
toml_get() {
  local file="$1" key="$2"
  grep -m1 "^${key} = " "$file" | sed -E 's/^[^=]+= "?([^"]*)"?$/\1/'
}

# --- Regenerate wrangler.prod.toml ---

WORKER_NAME=$(toml_get wrangler.prod.toml "name")
DATABASE_ID=$(toml_get wrangler.prod.toml "database_id")
DOMAIN=$(toml_get wrangler.prod.toml "DOMAIN")

# Check if routes were uncommented (deployer has configured DNS routing)
ROUTES_ACTIVE=false
if grep -q '^pattern = ' wrangler.prod.toml; then
  ROUTES_ACTIVE=true
  ZONE_NAME=$(toml_get wrangler.prod.toml "zone_name")
fi

cp wrangler.toml wrangler.prod.toml
sed -i '' "s/^name = .*/name = \"$WORKER_NAME\"/" wrangler.prod.toml
sed -i '' "s/YOUR_DATABASE_ID/$DATABASE_ID/" wrangler.prod.toml
sed -i '' "s/YOUR_DOMAIN/$DOMAIN/g" wrangler.prod.toml
sed -i '' "s/^database_name = .*/database_name = \"$WORKER_NAME\"/" wrangler.prod.toml

if [ "$ROUTES_ACTIVE" = true ]; then
  # Deployer has real routes — set the actual zone_name
  sed -i '' "s/^zone_name = .*/zone_name = \"$ZONE_NAME\"/" wrangler.prod.toml
else
  # Routes were commented out — keep them commented
  sed -i '' 's/^\(\[\[routes\]\]\)/# \1/' wrangler.prod.toml
  sed -i '' 's/^pattern = /# pattern = /' wrangler.prod.toml
  sed -i '' 's/^zone_name = /# zone_name = /' wrangler.prod.toml
fi

echo "  wrangler.prod.toml ... synced"

# --- Regenerate wrangler.admin.prod.toml ---

ADMIN_WORKER_NAME=$(toml_get wrangler.admin.prod.toml "name")
ADMIN_DATABASE_ID=$(toml_get wrangler.admin.prod.toml "database_id")
ADMIN_DOMAIN=$(toml_get wrangler.admin.prod.toml "DOMAIN")
API_SERVICE_NAME=$(toml_get wrangler.admin.prod.toml "service")

ADMIN_ROUTES_ACTIVE=false
if grep -q '^pattern = ' wrangler.admin.prod.toml; then
  ADMIN_ROUTES_ACTIVE=true
  ADMIN_ZONE_NAME=$(toml_get wrangler.admin.prod.toml "zone_name")
fi

cp wrangler.admin.toml wrangler.admin.prod.toml
sed -i '' "s/^name = .*/name = \"$ADMIN_WORKER_NAME\"/" wrangler.admin.prod.toml
sed -i '' "s/YOUR_DATABASE_ID/$ADMIN_DATABASE_ID/" wrangler.admin.prod.toml
sed -i '' "s/YOUR_DOMAIN/$ADMIN_DOMAIN/g" wrangler.admin.prod.toml
sed -i '' "s/YOUR_API_WORKER_NAME/$API_SERVICE_NAME/" wrangler.admin.prod.toml
sed -i '' "s/^database_name = .*/database_name = \"${ADMIN_WORKER_NAME%-admin}\"/" wrangler.admin.prod.toml

if [ "$ADMIN_ROUTES_ACTIVE" = true ]; then
  sed -i '' "s/^zone_name = .*/zone_name = \"$ADMIN_ZONE_NAME\"/" wrangler.admin.prod.toml
else
  sed -i '' 's/^\(\[\[routes\]\]\)/# \1/' wrangler.admin.prod.toml
  sed -i '' 's/^pattern = /# pattern = /' wrangler.admin.prod.toml
  sed -i '' 's/^zone_name = /# zone_name = /' wrangler.admin.prod.toml
fi

echo "  wrangler.admin.prod.toml ... synced"
echo ""

# --- Install dependencies ---

echo "Installing dependencies ..."
pnpm install
echo ""

# --- Deploy API Worker (migrations + deploy) ---

echo "Deploying API worker ..."
echo "  Running D1 migrations ..."
echo "y" | $WRANGLER d1 migrations apply DB --remote --config wrangler.prod.toml || {
  echo "Error: API worker migrations failed."
  exit 1
}

echo "  Deploying worker ..."
$WRANGLER deploy --config wrangler.prod.toml || {
  echo "Error: API worker deployment failed."
  exit 1
}

echo ""

# --- Deploy Admin Worker (migrations + deploy) ---

echo "Deploying Admin worker ..."
echo "  Running D1 migrations ..."
echo "y" | $WRANGLER d1 migrations apply DB --remote --config wrangler.admin.prod.toml || {
  echo "Error: Admin worker migrations failed."
  exit 1
}

echo "  Deploying worker ..."
$WRANGLER deploy --config wrangler.admin.prod.toml || {
  echo "Error: Admin worker deployment failed."
  exit 1
}

echo ""

# --- Summary ---

echo "=== Upgrade complete! ==="
echo ""
echo "  Version:  v$NEW_VERSION"
echo "  API:      deployed"
echo "  Admin:    deployed"
echo ""
