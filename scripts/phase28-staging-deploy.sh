#!/bin/bash
# Phase 28 — Deploy server bugfix overlay to STAGING only
set -euo pipefail

APP_DIR="/var/www/erp-staging"
PKG="/tmp/erp-phase28-bugfix-deploy.tar.gz"
LOG="/tmp/erp-phase28-staging-deploy.log"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

exec > >(tee -a "$LOG") 2>&1
echo "=== Phase 28 staging overlay deploy $TS ==="

test -f "$PKG"

cd "$APP_DIR"
tar -xzf "$PKG" -C "$APP_DIR"

export NPM_CONFIG_PRODUCTION=false
npm install

export NEXT_PUBLIC_POCKETBASE_URL="https://pb-staging.serba.space"
export NEXT_PUBLIC_APP_URL="https://staging.serba.space"
export NODE_ENV=production
npm run build

test -f .next/BUILD_ID
echo "BUILD_ID=$(cat .next/BUILD_ID)"

pm2 restart erp-system-staging
pm2 describe erp-system-staging | grep -E 'status|uptime|pid'
echo "=== staging deploy complete ==="
