#!/bin/bash
set -eu
cd /var/www/erp
set -a; source .env.local; set +a
export NODE_ENV=production
echo "NEXT_PUBLIC_POCKETBASE_URL=$NEXT_PUBLIC_POCKETBASE_URL"
echo "=== Clean install + build ==="
rm -rf node_modules .next
npm ci 2>&1 | tail -5
npm run build > /tmp/erp-prod-phase26-build4.log 2>&1
EXIT=$?
echo "BUILD_EXIT=$EXIT"
if [ "$EXIT" -ne 0 ]; then
  echo "FAILED:"; tail -20 /tmp/erp-prod-phase26-build4.log
  exit 1
fi
echo "BUILD_ID=$(cat .next/BUILD_ID)"
pm2 restart erp-system
sleep 5
pm2 show erp-system | grep -E '(status|pid|uptime|restart)' | head -6
echo "DEPLOY_OK"
