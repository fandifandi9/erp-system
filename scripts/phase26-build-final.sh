#!/bin/bash
set -eu
cd /var/www/erp
PB_URL=$(grep '^NEXT_PUBLIC_POCKETBASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
echo "PB_URL=$PB_URL"
rm -rf node_modules .next
# Install ALL deps including devDependencies (required for build)
NPM_CONFIG_PRODUCTION=false npm ci 2>&1 | tail -3
test -d node_modules/@tailwindcss/postcss || { echo "FATAL: @tailwindcss/postcss still missing"; exit 1; }
echo "tailwind postcss: OK"
set -a; source .env.local; set +a
export NODE_ENV=production
npm run build > /tmp/erp-prod-phase26-build5.log 2>&1
EXIT=$?
echo "BUILD_EXIT=$EXIT"
if [ "$EXIT" -ne 0 ]; then tail -15 /tmp/erp-prod-phase26-build5.log; exit 1; fi
echo "BUILD_ID=$(cat .next/BUILD_ID)"
pm2 restart erp-system
sleep 5
pm2 show erp-system | grep -E '(status|pid|uptime|restart)' | head -6
echo "DEPLOY_OK BUILD_ID=$(cat .next/BUILD_ID)"
