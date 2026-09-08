#!/bin/bash
# Phase 26 — Full local source deploy to production (no git reset)
set -euo pipefail

APP_DIR="/var/www/erp"
PKG="/tmp/erp-production-deploy.tar.gz"
LOG="/tmp/erp-prod-phase26-full.log"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

exec > >(tee -a "$LOG") 2>&1
echo "=== Phase 26 full source deploy $TS ==="

if [ ! -f "$PKG" ]; then
  echo "ERROR: missing $PKG"
  exit 1
fi

cp "$APP_DIR/.env.local" "/tmp/erp-prod-env.local.bak-$TS"

cd "$APP_DIR"
tar -xzf "$PKG" -C "$APP_DIR"

export NPM_CONFIG_PRODUCTION=false
npm install

export NEXT_PUBLIC_POCKETBASE_URL="https://pb.serba.space"
export NEXT_PUBLIC_APP_URL="https://serba.space"
export NODE_ENV=production
npm run build

test -f .next/BUILD_ID
echo "BUILD_ID=$(cat .next/BUILD_ID)"

pm2 restart erp-system
pm2 describe erp-system | grep -E 'status|uptime|pid'
echo "=== deploy complete ==="
