# PHASE 12B — Staging UAT Access

**Date:** 2026-08-13  
**Status:** **PASS — public HTTPS UAT live**  
**Production:** UNTOUCHED

Owner decisions: D1–D4 approved.

---

## Architecture

```
Internet
  → https://staging.serba.space
       → Nginx (TLS)
       → Next.js staging 127.0.0.1:3002  (PM2 erp-system-staging)
       → PocketBase staging via server env http://127.0.0.1:8092
         (browser NEXT_PUBLIC → https://pb-staging.serba.space)

  → https://pb-staging.serba.space
       → Nginx (TLS)
       → 127.0.0.1:8092 PocketBase staging (loopback-only bind)
```

Production remains:

```
serba.space → :3000 (erp-system)
pb.serba.space → :8091 (pb-erp)
```

---

## DNS

| Host | Content | Proxy | Status |
| --- | --- | --- | --- |
| `staging.serba.space` | `72.62.194.224` | DNS only | **PASS** |
| `pb-staging.serba.space` | resolves (CF anycast / origin) | was proxied in resolver view; origin serves | **PASS** |

Production DNS records not modified by this phase.

---

## Nginx

Isolated server blocks only:

- `/etc/nginx/sites-available/staging.serba.space` → `http://127.0.0.1:3002`
- `/etc/nginx/sites-available/pb-staging.serba.space` → `http://127.0.0.1:8092`

Enabled via sites-enabled symlinks. Production `serba.space` / `pb-erp` configs not edited.

---

## SSL / HTTPS

Let’s Encrypt cert: `/etc/letsencrypt/live/staging.serba.space/`  
Hosts covered: `staging.serba.space`, `pb-staging.serba.space`  
Expires: 2026-11-11  

| URL | Result |
| --- | --- |
| `https://staging.serba.space/login` | **200** |
| `https://staging.serba.space/hr` | **200** |
| `https://staging.serba.space/hr/rating` | **200** |
| `https://pb-staging.serba.space/api/health` | **200** |

---

## Next staging

| Item | Value |
| --- | --- |
| Path | `/var/www/erp-staging` |
| PM2 | `erp-system-staging` |
| Bind | **`127.0.0.1:3002`** (standalone `server.js`) |
| Source | `git archive HEAD` = `fad420b7` + selective overlays (Rating + Attendance APIs + `auth-model` helpers) — **not** full dirty WIP tree |
| Client PB | `NEXT_PUBLIC_POCKETBASE_URL=https://pb-staging.serba.space` |
| Server PB | `POCKETBASE_URL=http://127.0.0.1:8092` |
| Admin | `POCKETBASE_STAGING_ADMIN_*` only |

**Note:** This commit tree has no `/api/health` route — public app health validated via `/login` + PB health. Optional follow-up: add health route overlay.

---

## PocketBase staging

| Item | Value |
| --- | --- |
| Bind | **`127.0.0.1:8092` only** |
| PM2 | `pb-erp-staging` |
| Public | via Nginx `pb-staging.serba.space` only (port not exposed) |

---

## Authentication

| Check | Result |
| --- | --- |
| Staging admin auth | **PASS** |
| Smoke user login (`smoke-hr@serba.test`) via `pb-staging` | **PASS** |
| Production credentials | **not used** |

---

## Health / API checks (`scripts/test-staging-uat-public.mjs`)

**PASS=8 FAIL=0**

| Check | Result |
| --- | --- |
| PB health HTTPS | PASS |
| Next login page HTTPS | PASS |
| Staging user login | PASS |
| Rating API `/api/hr/rating/periods` | PASS (200) |
| Rating API `/api/hr/rating/aspects` | PASS (200, 5 items) |
| Attendance API `/api/hr/attendance/today` | PASS (200) |
| Leave direct PB create | PASS (**403** locked) |
| Staging admin auth | PASS |

---

## Security isolation

- Staging Next not on public interface (loopback :3002).  
- Staging PB not on public interface (loopback :8092).  
- Public entry only via HTTPS Nginx hostnames.  
- Staging guard updated to allowlist `staging.serba.space` / `pb-staging.serba.space` without treating all `*.serba.space` as production.

---

## Production untouched confirmation

| Check | Result |
| --- | --- |
| PM2 `pb-erp` | online, **16D**, **0** restarts |
| PM2 `erp-system` | online, **16D**, **0** restarts |
| Port 8091 | still production PB |
| Production DNS | not modified by agent |
| Production Nginx site files | not modified |
| Leave production write-lock | not applied / not changed |
| Production schema | not changed |
| Production deploy | **not done** |

---

## Known limitations

1. `/api/health` missing on this staging app revision (HEAD) — use `/login` + PB health.  
2. Staging Next is a **controlled archive + selective Phase 11/12 overlays**, not the full dirty workstation tree.  
3. `pb-staging.serba.space` may show Cloudflare anycast in public DNS while origin is VPS — HTTPS origin cert is Let’s Encrypt on the VPS.  
4. Human UAT from laptop/HP should use **https://staging.serba.space** with staging accounts (e.g. smoke users / staging seed users) — not production passwords.

---

## Owner UAT

Open on any network:

**https://staging.serba.space**

All devices hit the same staging stack (Next :3002 + PB :8092).

**STOP** — no production Rating deploy.
