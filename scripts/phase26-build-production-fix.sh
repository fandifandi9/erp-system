#!/bin/bash
# Phase 26 — Fix production build after full source extract
set -eu
PROD_DIR=/var/www/erp
cd "$PROD_DIR"

echo "=== Phase 26 Production Build Fix ==="
set -a
source .env.local
set +a
export NODE_ENV=production

echo "NEXT_PUBLIC_POCKETBASE_URL=${NEXT_PUBLIC_POCKETBASE_URL}"

# Full install (include devDependencies needed for build)
echo "=== npm install ==="
npm install 2>&1 | tail -5

echo "=== npm run build ==="
npm run build > /tmp/erp-prod-phase26-build2.log 2>&1
BUILD_EXIT=$?
echo "BUILD_EXIT=$BUILD_EXIT"

if [ "$BUILD_EXIT" -ne 0 ]; then
  echo "BUILD FAILED:"
  tail -40 /tmp/erp-prod-phase26-build2.log
  exit 1
fi

BUILD_ID=$(cat .next/BUILD_ID)
echo "BUILD_ID=$BUILD_ID"

echo "=== PM2 restart erp-system ==="
pm2 restart erp-system
sleep 5
pm2 show erp-system | grep -E '(status|pid|uptime|restart)' | head -8
echo "DEPLOY_OK BUILD_ID=$BUILD_ID"
