# PocketBase ERP Staging — Preparation Guide

**Status:** Git-safe documentation only. Staging is **not** deployed by this file.

---

## Production (do not modify from staging workflows)

| Item | Value |
|------|--------|
| Directory | `/var/www/pocketbase-erp` |
| Port | **8091** |
| Bind | `0.0.0.0` (current) |
| PM2 name | `pb-erp` |
| Data | `/var/www/pocketbase-erp/pb_data` |
| Version | PocketBase **0.22.0** |
| Public URL | `https://pb.serba.space` |

**Hard rules:**

- Production `pb_data` must **never** be mounted, shared, or copied into staging as the live staging database.
- Production credentials must **never** be reused for staging admin or committed to Git.
- Production PocketBase API rules must **never** be modified by staging scripts.
- Port **8091** / process `pb-erp` must remain untouched by staging work.

---

## Staging target (future — requires explicit approval)

| Item | Value |
|------|--------|
| Directory | `/var/www/pocketbase-erp-staging` |
| Port | **8092** |
| Bind | **`127.0.0.1:8092`** (Nginx terminates HTTPS) |
| PM2 name | `pb-erp-staging` |
| Data | `/var/www/pocketbase-erp-staging/pb_data` (**separate**) |
| Hostname (planned) | `pb-staging.serba.space` |

Staging uses:

- Separate `pb_data`, storage, logs, backups
- Separate staging admin credentials
- Same PocketBase binary version **0.22.0** as production
- Prefer schema via **server-local** copy of `pb_migrations` (not automatic Git commit)

---

## Explicit approval gates

| Action | Approval required |
|--------|-------------------|
| Create staging directories / copy binary / migrations on VPS | **Yes** |
| Start PM2 `pb-erp-staging` | **Yes** |
| DNS for `pb-staging.serba.space` | **Yes** |
| Apply Nginx site for staging | **Yes** |
| Apply leave write-lock on **staging** | **Yes** |
| Apply leave write-lock on **production** | **Separate yes** — never via staging scripts |

---

## Related repo artifacts

| Path | Purpose |
|------|---------|
| `ecosystem.pb-erp-staging.cjs.example` | Secret-free PM2 example |
| `nginx-pb-staging.serba.space.conf.example` | Secret-free Nginx example (do not apply yet) |
| `scripts/pb-apply-leave-write-lock.mjs` | Staging-only leave write lock (refuses prod host) |
| `scripts/seed-hr-leave-staging.mjs` | Staging fixture seed (refuses prod URL) |
| `scripts/test-hr-leave-pb-direct.mjs` | Direct PB security tests (staging-gated) |
| `pb/rules/leave_requests.*` | Leave rule SoT / snapshot / apply docs |

---

## Immediate purpose

Security testing for HR Leave (`leave_requests`) before any production rule change:

- Target: `createRule` / `updateRule` / `deleteRule` = `null` (superuser-only)
- list/view: keep scoped read expression

See `pb/rules/leave_requests.md`.

---

## Safe seed + baseline test (from repo root)

Do **not** copy these scripts into `/var/www/pocketbase-erp-staging`. Run from the Git checkout (workstation or VPS clone). Staging PB listens on **127.0.0.1:8092** only — use an SSH tunnel from a workstation:

```bash
ssh -L 8092:127.0.0.1:8092 <user>@<vps>
```

Create gitignored credentials (never commit):

```bash
# .env.staging.local  (gitignored via .env* + deploy/staging/*.local)
POCKETBASE_STAGING_URL=http://127.0.0.1:8092
POCKETBASE_STAGING_ADMIN_EMAIL=<staging-only-admin>
POCKETBASE_STAGING_ADMIN_PASSWORD=<staging-only-password>
STAGING_SEED_PASSWORD=<fixture-users-password>
STAGING_SEED_INCLUDE_COMPANY_B=1
STAGING_EXPECT_MODE=baseline
```

Guards (hard stop):

- refuses `pb.serba.space` / `serba.space`
- refuses URL equal to `NEXT_PUBLIC_POCKETBASE_URL`
- refuses port **8091**
- requires `POCKETBASE_STAGING_*` (never falls back to production `POCKETBASE_ADMIN_*`)
- refuses staging admin email/password equal to production admin
- never auto-deletes records

Exact commands:

```bash
# 0) Optional: validate guards without writes
STAGING_SEED_DRY_RUN=1 npm run seed:hr-leave-staging

# 1) Seed [STAGING] companies + Owner / HR-A / Staff-A1 / Staff-A2 (+ Company B; optional HR-B/Staff-B)
npm run seed:hr-leave-staging

# 2) Baseline direct-PB matrix (BEFORE write-lock)
STAGING_EXPECT_MODE=baseline npm run test:hr-leave-pb-direct

# 3) Apply write-lock on staging ONLY (after baseline OK + explicit approval)
npm run pb:leave-write-lock:staging

# 4) Locked matrix
STAGING_EXPECT_MODE=locked npm run test:hr-leave-pb-direct

# 5) Next.js API regression (Next process must use staging PB + staging admin only)
BASE_URL=http://127.0.0.1:3000 npm run test:hr-leave-api-staging
```

**Phase status (2026-08-12):**

| Phase | Status |
|-------|--------|
| Staging write-lock | COMPLETE (create/update/delete = null) |
| Direct PB locked tests | COMPLETE 13/13 |
| Staging API regression | COMPLETE |
| Production write-lock | **NOT DONE** — needs explicit human approval |

Help:

```bash
node scripts/seed-hr-leave-staging.mjs --help
node scripts/test-hr-leave-pb-direct.mjs --help
```
