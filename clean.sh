#!/usr/bin/env bash
# GridBoard - full clean (macOS / Linux). Wipes local DB, uploaded assets,
# build output, and (optionally) node_modules. After this, run ./dev.sh to start fresh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[clean] Removing local.db, local.db-shm, local.db-wal..."
rm -f local.db local.db-shm local.db-wal

echo "[clean] Removing uploads/..."
rm -rf uploads

echo "[clean] Removing dist/ outputs..."
rm -rf packages/domain/dist packages/server/dist packages/client/dist

read -rp "[clean] Also remove node_modules? (y/N) " KEEP_NM
if [[ "${KEEP_NM:-N}" =~ ^[Yy]$ ]]; then
  echo "[clean] Removing node_modules..."
  rm -rf node_modules
  rm -rf packages/domain/node_modules packages/server/node_modules packages/client/node_modules
fi

echo "[clean] Done."
