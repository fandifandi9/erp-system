#!/bin/bash
# Phase 26 — Production overlay deploy (restore git HEAD + Phase 24 files only)
set -euo pipefail

APP_DIR="/var/www/erp"
BACKUP_DIR="/var/www/erp-backups"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OVERLAY="/tmp/erp-phase24-deploy.tar.gz"
LOG="/tmp/erp-prod-phase26-overlay.log"

exec > >(tee -a "$LOG") 2>&1
echo "=== Phase 26 overlay deploy started $TS ==="

cd "$APP_DIR"

if [ ! -f "$OVERLAY" ]; then
  echo "ERROR: missing $OVERLAY"
  exit 1
fi

cp .env.local "/tmp/erp-prod-env.local.bak-$TS"

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/phase26-overlay-pre-$TS.tgz" \
  lib/notifications \
  app/api/notifications \
  app/api/push-tokens \
  app/api/hr/leave/route.ts \
  app/api/hr/leave/\[id\]/approve/route.ts \
  app/api/hr/leave/\[id\]/reject/route.ts \
  lib/hr/reporting-http.ts \
  package.json 2>/dev/null || true

echo "Restoring committed production source..."
git reset --hard HEAD
git clean -fd -e .env.local

echo "Applying Phase 24 overlay..."
tar -xzf "$OVERLAY" -C "$APP_DIR"

echo "Installing dependencies..."
export NPM_CONFIG_PRODUCTION=false
npm ci

echo "Building production..."
export NEXT_PUBLIC_POCKETBASE_URL="https://pb.serba.space"
export NEXT_PUBLIC_APP_URL="https://serba.space"
export NODE_ENV=production
npm run build

if [ ! -f .next/BUILD_ID ]; then
  echo "ERROR: build finished without .next/BUILD_ID"
  exit 1
fi

echo "BUILD_ID=$(cat .next/BUILD_ID)"
echo "Restarting PM2..."
pm2 restart erp-system
pm2 describe erp-system | grep -E 'status|uptime|pid'

echo "=== Phase 26 overlay deploy complete ==="
