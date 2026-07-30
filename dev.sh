#!/usr/bin/env bash
# GridBoard - local development launcher (macOS / Linux)
# Boots server (http://localhost:3000) and client (http://localhost:5173)
# using the zero-infra SQLite + LocalStorage path. Requires Node 20+ and pnpm.

set -euo pipefail

# Always run from the repo root, regardless of where the script was invoked.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Verify tooling
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[dev] ERROR: pnpm is not on PATH. Install it with: npm i -g pnpm"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[dev] ERROR: node is not on PATH. Install Node 20 or newer."
  exit 1
fi

# 2. Install workspace deps on first run
if [ ! -d "node_modules" ]; then
  echo "[dev] Installing workspace dependencies (first run, this may take a minute)..."
  pnpm install
fi

# 3. Create .env from .env.example if missing
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "[dev] Creating .env from .env.example"
    cp ".env.example" ".env"
  else
    echo "[dev] WARNING: .env.example not found; using server defaults."
  fi
fi

# 3b. Load .env into this shell. The server itself does not auto-load .env,
#     and several env vars (JWT_SECRET, DATABASE_URL) are required for boot.
eval "$(node "$SCRIPT_DIR/scripts/load-env.mjs" "$SCRIPT_DIR/.env" sh)"

# 4. Ensure the SQLite DB is initialized (no-op if it already exists).
#    Drizzle-kit needs the `file:` URL form because its better-sqlite3 path
#    strips that prefix; the server itself expects `sqlite:`, so we set
#    `file:` only for the migration step and restore `sqlite:` for `pnpm dev`.
if [ ! -f "local.db" ]; then
  echo "[dev] First boot: running database migrations..."
  (
    cd packages/server
    export OPSX_DIALECT=sqlite
    export DATABASE_URL="file:${SCRIPT_DIR}/local.db"
    pnpm exec drizzle-kit migrate --config drizzle.config.ts
  )
  export DATABASE_URL="sqlite:${SCRIPT_DIR}/local.db"
fi

echo
echo "[dev] Starting GridBoard..."
echo "[dev]   Server: http://localhost:3000"
echo "[dev]   Client: http://localhost:5173"
echo "[dev]   Press Ctrl+C to stop."
echo

exec pnpm dev
