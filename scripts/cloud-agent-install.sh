#!/usr/bin/env bash
#
# Idempotent Cloud Agent install step for the SERBA ERP (Next.js + PocketBase).
#
# Responsibilities (all safe to re-run):
#   1. Ensure a local .env.local exists pointing Next.js at a LOCAL PocketBase.
#   2. Install JS dependencies from the lockfile.
#   3. Download the pinned local PocketBase binary and bootstrap its schema +
#      local fixtures into ./pb_data (via scripts/bootstrap-local-pb.mjs).
#
# It never targets staging/production PocketBase — bootstrap-local-pb.mjs binds
# to 127.0.0.1:8090 and refuses serba.space / :8091 / :8092 hosts.

set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Local env for a PocketBase-backed dev server. .env.local is gitignored,
#    so recreate it on a fresh checkout with LOCAL-ONLY throwaway credentials.
if [ ! -f .env.local ]; then
  echo "[cloud-agent-install] Creating .env.local (local PocketBase dev config)"
  cat > .env.local <<'ENV'
# Local development environment (Cloud Agent)
# PocketBase runs locally on 127.0.0.1:8090 (see scripts/bootstrap-local-pb.mjs).

NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Local PocketBase superuser (LOCAL ONLY — never production/gmail).
POCKETBASE_ADMIN_EMAIL=local-admin@serba.local
POCKETBASE_ADMIN_PASSWORD="LocalDevAdmin2026!"

# Seeded smoke owner login (created during bootstrap).
SMOKE_PASSWORD="SerbaSmoke2026!"
SMOKE_EMAIL_DOMAIN=serba.test
SMOKE_APP_URL=http://localhost:3000

PASSWORD_RESET_SECRET=local-dev-only-password-reset-secret-change-me
ENV
else
  echo "[cloud-agent-install] .env.local already present — leaving it untouched"
fi

# 2. Install JS dependencies deterministically from the committed lockfile.
echo "[cloud-agent-install] Installing dependencies (npm ci)"
npm ci

# 3. Download local PocketBase + bootstrap schema and fixtures into ./pb_data.
#    The bootstrap seeds the durable pb_data snapshot exactly once; the sentinel
#    keeps this step idempotent (safe to re-run) without re-PATCHing collections.
#    Delete pb_data/ (or the sentinel) to force a fresh re-bootstrap.
BOOTSTRAP_SENTINEL="pb_data/.cloud-agent-bootstrap-done"
if [ -f "$BOOTSTRAP_SENTINEL" ]; then
  echo "[cloud-agent-install] PocketBase already bootstrapped (found $BOOTSTRAP_SENTINEL) — skipping"
else
  echo "[cloud-agent-install] Bootstrapping local PocketBase schema + fixtures"
  node scripts/bootstrap-local-pb.mjs
  touch "$BOOTSTRAP_SENTINEL"
fi

echo "[cloud-agent-install] Done."
