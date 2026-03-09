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
