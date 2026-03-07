#!/usr/bin/env bash
#
# feedmail installer
#
# Checks prerequisites, clones the repository, installs dependencies,
# and hands off to the interactive setup wizard.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/alexmensch/feedmail/master/scripts/install.sh | bash

set -euo pipefail

echo ""
echo "=== feedmail installer ==="
echo ""

# --- Prerequisite checks ---

check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: $1 is not installed. $2"
    exit 1
  fi
  echo "  $1 ... ok"
}

echo "Checking prerequisites:"

check_command git "Install from https://git-scm.com/"

check_command node "Install Node.js v18+ from https://nodejs.org/"
NODE_MAJOR=$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js v18+ is required (found v$(node --version | sed 's/^v//'))"
  exit 1
fi

check_command pnpm "Install from https://pnpm.io/installation"

echo ""

# --- Clone repository ---

read -rp "Install directory [./feedmail]: " INSTALL_DIR < /dev/tty
INSTALL_DIR="${INSTALL_DIR:-./feedmail}"
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

if [ -d "$INSTALL_DIR" ]; then
  echo "Error: Directory '$INSTALL_DIR' already exists."
  exit 1
fi

echo ""
echo "Cloning feedmail into $INSTALL_DIR ..."
git clone https://github.com/alexmensch/feedmail.git "$INSTALL_DIR"

echo ""
echo "Installing dependencies ..."
cd "$INSTALL_DIR"
pnpm install

echo ""

# --- Hand off to setup wizard ---

exec bash scripts/setup.sh
