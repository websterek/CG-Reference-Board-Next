#!/usr/bin/env bash
# GridBoard - reset the local SQLite database (macOS / Linux).
# Deletes ./local.db* and re-runs migrations. Safe to run any time.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[reset-db] ERROR: pnpm is not on PATH. Install it with: npm i -g pnpm"
  exit 1
fi

# Load .env so any custom DATABASE_URL is honored.
if [ -f ".env" ]; then
  eval "$(node "$SCRIPT_DIR/scripts/load-env.mjs" "$SCRIPT_DIR/.env" sh)"
fi

echo "[reset-db] Removing local.db, local.db-shm, local.db-wal..."
rm -f local.db local.db-shm local.db-wal

echo "[reset-db] Re-running migrations..."
(
  cd packages/server
  export OPSX_DIALECT=sqlite
  export DATABASE_URL="file:${SCRIPT_DIR}/local.db"
  pnpm exec drizzle-kit migrate --config drizzle.config.ts
)
export DATABASE_URL="sqlite:${SCRIPT_DIR}/local.db"

echo "[reset-db] Done. Database reset complete."
