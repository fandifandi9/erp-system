#!/bin/bash
# Staging-only: proxy PocketBase on staging.serba.space/_pb
# so the browser never hits Cloudflare HTTP/3 on pb-staging.serba.space.
# Does not touch production nginx, pb-erp, or erp-system.
set -euo pipefail

STAGING_SITE=/etc/nginx/sites-available/staging.serba.space
BACKUP=/etc/nginx/sites-available/staging.serba.space.bak-20260814-login

test -f "$STAGING_SITE"
if [[ ! -f "$BACKUP" ]]; then
  cp -a "$STAGING_SITE" "$BACKUP"
  echo BACKUP_OK
else
  echo BACKUP_EXISTS
fi

if grep -q 'location /_pb/' "$STAGING_SITE"; then
  echo NGINX_ALREADY_PATCHED
else
  python3 - <<'PY'
from pathlib import Path
p = Path("/etc/nginx/sites-available/staging.serba.space")
text = p.read_text()
needle = "    location / {"
insert = """    location /_pb/ {
        proxy_pass http://127.0.0.1:8092/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 120s;
        client_max_body_size 32m;
    }

"""
if needle not in text:
    raise SystemExit("nginx needle not found")
p.write_text(text.replace(needle, insert + needle, 1))
print("NGINX_PATCHED")
PY
fi

nginx -t
systemctl reload nginx
echo NGINX_RELOADED

curl -sS -m 8 -o /tmp/staging-pb-health.json -w 'same_origin_health=%{http_code}\n' https://staging.serba.space/_pb/api/health
head -c 200 /tmp/staging-pb-health.json; echo

ENV=/var/www/erp-staging/.env.local
test -f "$ENV"
sed -i 's|^NEXT_PUBLIC_POCKETBASE_URL=.*|NEXT_PUBLIC_POCKETBASE_URL=https://staging.serba.space/_pb|' "$ENV"
grep '^NEXT_PUBLIC_POCKETBASE_URL=' "$ENV"
grep '^POCKETBASE_URL=' "$ENV"

cd /var/www/erp-staging
nohup npm run build >/tmp/erp-staging-login-fix.log 2>&1 &
echo BUILD_PID=$!
echo BUILD_STARTED
