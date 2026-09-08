#!/bin/bash
# Phase 26 — Deploy local source to Production Next.js (/var/www/erp)
set -eu

PROD_DIR=/var/www/erp
BACKUP_DIR=/var/www/erp-backups
PKG=/tmp/erp-production-deploy.tar.gz
TS=$(date +%Y%m%dT%H%M%SZ)

echo "=== Phase 26 Production Deploy ==="
echo "Target: $PROD_DIR"
echo "Package: $PKG"
ls -la "$PKG"

# Verify package
tar -tzf "$PKG" | head -5
echo "... ($(tar -tzf "$PKG" | wc -l) files total)"

# Backup .env.local separately (never in tarball)
cp -a "$PROD_DIR/.env.local" "/tmp/erp-prod-env-backup-${TS}.local"
echo "ENV backup: /tmp/erp-prod-env-backup-${TS}.local"

# Backup current app (excluding node_modules and .next for speed)
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/phase26-pre-${TS}.tgz" \
  --exclude=node_modules --exclude=.next \
  -C "$PROD_DIR" . 2>/dev/null || true
echo "App backup: $BACKUP_DIR/phase26-pre-${TS}.tgz"

# Extract source (preserve .env.local — not in package)
cd "$PROD_DIR"
tar -xzf "$PKG"
echo "EXTRACT_OK"

# Restore .env.local if overwritten (should not be in package)
if [ -f "/tmp/erp-prod-env-backup-${TS}.local" ]; then
  cp -a "/tmp/erp-prod-env-backup-${TS}.local" "$PROD_DIR/.env.local"
fi

echo "=== .env.local (non-secret keys) ==="
grep -E '^(NEXT_PUBLIC|PORT|NODE_ENV)' "$PROD_DIR/.env.local" || true

# Verify no staging/localhost in env
if grep -qE 'staging\.serba\.space|127\.0\.0\.1|localhost' "$PROD_DIR/.env.local"; then
  echo "ERROR: staging/localhost found in .env.local — aborting build"
  exit 1
fi
echo "ENV_OK"

# Install deps if package.json changed
echo "=== npm ci ==="
cd "$PROD_DIR"
npm ci --omit=dev 2>&1 | tail -3

echo "=== npm run build ==="
set -a
source .env.local
set +a
export NODE_ENV=production
npm run build > /tmp/erp-prod-phase26-build.log 2>&1
BUILD_EXIT=$?
echo "BUILD_EXIT=$BUILD_EXIT"
if [ "$BUILD_EXIT" -ne 0 ]; then
  echo "BUILD FAILED — last 30 lines:"
  tail -30 /tmp/erp-prod-phase26-build.log
  exit 1
fi

BUILD_ID=$(cat .next/BUILD_ID 2>/dev/null || echo "unknown")
echo "BUILD_ID=$BUILD_ID"

echo "=== PM2 restart erp-system (application only) ==="
pm2 restart erp-system
sleep 4
pm2 show erp-system | grep -E '(status|pid|uptime|restart)' | head -6
echo "DEPLOY_OK BUILD_ID=$BUILD_ID"
