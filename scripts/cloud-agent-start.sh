#!/usr/bin/env bash
#
# Cloud Agent start command for the SERBA ERP (Next.js + local PocketBase).
#
# Runs on every container start (after install). Brings up the local PocketBase
# API in the background, then runs the Next.js dev server in the foreground so
# the start process stays attached (as required for a per-boot service command).

set -euo pipefail

cd "$(dirname "$0")/.."

PB_BIN="./tools/local-pb/pocketbase"
PB_HEALTH="http://127.0.0.1:8090/api/health"

# Start local PocketBase in the background unless it is already healthy.
# --automigrate=0: apply committed pb_migrations on boot without writing new
# auto-generated migration files into the tracked pb_migrations/ directory.
if curl -sf "$PB_HEALTH" >/dev/null 2>&1; then
  echo "[cloud-agent-start] PocketBase already healthy on :8090"
elif [ -x "$PB_BIN" ]; then
  echo "[cloud-agent-start] Starting local PocketBase on 127.0.0.1:8090"
  nohup "$PB_BIN" serve --http=127.0.0.1:8090 --dir=./pb_data --automigrate=0 \
    > /tmp/pocketbase.log 2>&1 &
  # Wait briefly for the API to answer before launching the web server.
  for _ in $(seq 1 30); do
    if curl -sf "$PB_HEALTH" >/dev/null 2>&1; then
      echo "[cloud-agent-start] PocketBase is healthy"
      break
    fi
    sleep 0.5
  done
else
  echo "[cloud-agent-start] WARNING: $PB_BIN not found — run scripts/cloud-agent-install.sh first" >&2
fi

# Run the Next.js dev server in the foreground (keeps this start command attached).
echo "[cloud-agent-start] Starting Next.js dev server on :3000"
exec npm run dev
