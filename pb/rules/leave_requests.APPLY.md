# Apply leave_requests write-lock (staging first)

## Prerequisites

1. Separate staging PocketBase instance (not `pb.serba.space`).
2. Env:
   - `POCKETBASE_STAGING_URL`
   - `POCKETBASE_STAGING_ADMIN_EMAIL`
   - `POCKETBASE_STAGING_ADMIN_PASSWORD`
3. Backup staging collection rules (script prints previous rules before PATCH).

## Exact target

| Rule | Value |
|------|--------|
| listRule / viewRule | unchanged (own \|\| hr \|\| owner expression) |
| createRule | `null` (locked / superuser-only) |
| updateRule | `null` |
| deleteRule | `null` |

**Do not** set write rules to `""` (that opens public write).

## Command

```bash
npm run pb:leave-write-lock:staging
```

Script refuses production hosts (`pb.serba.space`, `serba.space` API hosts).

## After staging apply — test checklist

### Direct PB (user tokens) — expect DENY (403/404/400)

```bash
STAGING_EXPECT_MODE=locked npm run test:hr-leave-pb-direct
```

### Next.js API — expect PASS/DENY per Wave 2 contract

```bash
# Next process MUST use staging PB + staging admin (dedicated shell; never commit):
# NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8092
# POCKETBASE_ADMIN_EMAIL=<staging-only>
# POCKETBASE_ADMIN_PASSWORD=<staging-only>
BASE_URL=http://127.0.0.1:3000 npm run test:hr-leave-api-staging
```

Phase 5 (2026-08-12): staging API regression **PASS** with write-lock active.

## Production

Requires **explicit human approval** after staging green.

**Not done yet.** Production rules remain the open baseline in
`leave_requests.snapshot-prod-readonly.json`.

Then (only after approval):

1. Backup production rules.
2. Apply same `null` write locks.
3. Re-export live rules into `pb/rules/`.
4. Run safe API regression against production.
