#!/bin/sh
# Retry wrapper for wrangler commands that intermittently fail.
# Usage: wrangler-retry.sh <repo-root> <command...>
# Retries up to 3 times with a 3s delay between attempts.
# Exits 0 on first success, 1 if all attempts fail.

REPO_ROOT="$1"
shift

cd "$REPO_ROOT"

for attempt in 1 2 3; do
  if output=$(NO_COLOR=1 "$@" 2>&1); then
    echo "$output"
    exit 0
  fi
  echo "Attempt $attempt failed, retrying in 3s..." >&2
  echo "$output" >&2
  sleep 3
done

echo "ERROR: Command failed after 3 attempts: $*" >&2
exit 1
