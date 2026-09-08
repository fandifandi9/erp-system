# leave_requests — PocketBase API Rules (Source of Truth)

**Wave 2B status:** Staging **LOCKED** · Production apply **NOT DONE** (needs explicit human approval)

## Environment matrix

| Environment | Write rules (create/update/delete) | Notes |
|-------------|--------------------------------------|--------|
| **Production** `pb.serba.space` | **OPEN** (baseline snapshot) | See `leave_requests.snapshot-prod-readonly.json` |
| **Staging** `127.0.0.1:8092` | **`null` / locked** | Applied Phase 4; Direct PB writes DENY |
| Production write-lock | **Not applied** | Requires separate explicit human approval |

## Architecture

```
Web/Mobile → Next.js /api/hr/leave/* → auth + RBAC + company scope
  → lib/hr/leave-server.ts → PocketBase admin/superuser (server-only)
  → audit event
```

- **Direct PB mutations** (user/HR/Owner tokens): **DENIED** on staging after lock.
- **All leave mutations** must go through Next.js API / admin-service path.
- PocketBase has **no field-level ACL**. Do not leave client `updateRule` open.

## Exact locked representation (PocketBase semantics)

| Value | Meaning |
|-------|---------|
| `null` | **Locked** — superuser/admin only |
| `""` (empty string) | **Public** — anyone (DO NOT use for writes) |
| non-empty expression | Filter for users/guests |

**Staging (current) + production target:**

```json
{
  "createRule": null,
  "updateRule": null,
  "deleteRule": null
}
```

listRule / viewRule remain scoped authenticated reads (own \|\| hr \|\| owner).

## Production baseline (before lock)

Source: `leave_requests.snapshot-prod-readonly.json` (READ-ONLY fetch).

| Rule | Value |
|------|--------|
| listRule / viewRule | own \|\| hr \|\| owner |
| createRule | own user only |
| updateRule | own \|\| hr \|\| owner (**P0** open) |
| deleteRule | hr \|\| owner |

**Do not** treat the production snapshot as the hardened SoT — it is the **pre-lock baseline**.

## Verification (Phase 4–5)

| Check | Result |
|-------|--------|
| Staging direct PB locked matrix | 13/13 PASS |
| Staging Next.js API regression | PASS (see `scripts/test-hr-leave-api-staging.mjs`) |
| Production rules after staging lock | Still **open** (untouched) |

## Apply commands

```bash
# Staging only
npm run pb:leave-write-lock:staging
STAGING_EXPECT_MODE=locked npm run test:hr-leave-pb-direct

# API regression (Next must point at staging PB in that process only)
BASE_URL=http://127.0.0.1:3000 node scripts/test-hr-leave-api-staging.mjs
```

Production apply: **blocked until explicit human approval**. Never deploy staging rules to production automatically.
