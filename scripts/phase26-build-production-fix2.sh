#!/bin/bash
set -eu
cd /var/www/erp
set -a; source .env.local; set +a
export NODE_ENV=production
echo "=== Install missing build deps ==="
npm install @tailwindcss/postcss tailwindcss 2>&1 | tail -3
echo "=== Build ==="
npm run build > /tmp/erp-prod-phase26-build3.log 2>&1
echo "BUILD_EXIT=$?"
if [ $? -ne 0 ]; then tail -30 /tmp/erp-prod-phase26-build3.log; exit 1; fi
echo "BUILD_ID=$(cat .next/BUILD_ID)"
pm2 restart erp-system
sleep 4
pm2 show erp-system | grep -E '(status|pid|uptime|restart)' | head -6
echo "DEPLOY_OK BUILD_ID=$(cat .next/BUILD_ID)"
