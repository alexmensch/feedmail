#!/bin/sh
# Deletes a D1 database with retries, cleans up the output file.
# Usage: delete-d1.sh <database-name> <output-file> <repo-root>

DB_NAME="$1"
OUTFILE="$2"
REPO_ROOT="$3"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/wrangler-retry.sh" "$REPO_ROOT" sh -c "echo y | pnpm exec wrangler d1 delete $DB_NAME"
rm -f "$OUTFILE"
