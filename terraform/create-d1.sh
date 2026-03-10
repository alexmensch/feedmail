#!/bin/sh
# Creates a D1 database with retries, writes the database ID to a file.
# Usage: create-d1.sh <database-name> <output-file> <repo-root>

DB_NAME="$1"
OUTFILE="$2"
REPO_ROOT="$3"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

output=$("$SCRIPT_DIR/wrangler-retry.sh" "$REPO_ROOT" pnpm exec wrangler d1 create "$DB_NAME")
db_id=$(echo "$output" | grep 'database_id' | sed 's/.*= *//' | tr -d '"')

if [ -z "$db_id" ]; then
  echo "ERROR: Could not parse database_id from wrangler output:" >&2
  echo "$output" >&2
  exit 1
fi

echo "$db_id" > "$OUTFILE"
