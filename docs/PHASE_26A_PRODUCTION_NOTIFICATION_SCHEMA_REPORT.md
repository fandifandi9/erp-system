# Phase 26A — Production Notification Schema Migration

**Date:** 2026-08-29 (11:26 WIB)
**Mode:** ADDITIVE SCHEMA MIGRATION ONLY (CREATE)
**Target:** `https://pb.serba.space` (Production PocketBase)
**Application:** UNTOUCHED
**Result:** **PASS**

---

## Objective

Resolve the Phase 26 blocker by creating `notifications` and `push_tokens` collections on Production PocketBase, using the same schema and rules verified in Phase 24 (Local) and Phase 25 (Staging).

**Scope:** CREATE-only, idempotent, no modification to existing collections, fields, rules, or data.

---

## Pre-Migration Snapshot

**Timestamp:** 2026-08-29T04:26:28Z

| Collection | Status | Record Count |
|---|---|---|
| `notifications` | **ABSENT (404)** | N/A |
| `push_tokens` | **ABSENT (404)** | N/A |
| `users` | EXISTS | **23** |
| `profiles` | EXISTS | **23** |
| `leave_requests` | EXISTS | **34** |

Snapshot source: `docs/_phase26_production_pre_deploy.json` (Phase 26) + live GET at migration time.

---

## Existing Production Schema

Phase 21/22 schema verification (rating, reporting, users, leave): **88/88 PASS** — unchanged before and after Phase 26A.

No existing collection was modified. No existing field or rule was changed.

---

## notifications Schema

**Action:** `CREATE` (collection id: `erfmaoadnln4j68`)

### Fields

| Field | Type | Required |
|---|---|---|
| `recipient` | relation → users | Yes |
| `type` | text | Yes |
| `title` | text | No |
| `body` | text | No |
| `resource_type` | text | No |
| `resource_id` | text | No |
| `action` | text | No |
| `read_at` | date | No |
| `idempotency_key` | text | No |

### Rules

| Rule | Value |
|---|---|
| `listRule` | `@request.auth.id = recipient` |
| `viewRule` | `@request.auth.id = recipient` |
| `createRule` | `null` (server-only via admin PB) |
| `updateRule` | `@request.auth.id = recipient` |
| `deleteRule` | `null` (server-only) |

**User isolation:** Users can only read/update their own notifications. Clients cannot freely create notifications.

---

## push_tokens Schema

**Action:** `CREATE` (collection id: `8m326sq1plibdab`)

### Fields

| Field | Type | Required |
|---|---|---|
| `user` | relation → users | Yes |
| `token` | text | Yes |
| `platform` | select (`android`, `ios`) | No |
| `device_id` | text | No |
| `is_active` | bool | No |
| `last_seen` | date | No |

### Rules

| Rule | Value |
|---|---|
| `listRule` | `@request.auth.id = user` |
| `viewRule` | `@request.auth.id = user` |
| `createRule` | `@request.auth.id != ""` |
| `updateRule` | `@request.auth.id = user` |
| `deleteRule` | `null` (server handles deactivation) |

**Multi-device:** Each `device_id` gets its own record. User can register own tokens only.

---

## Migration Operations

Script: `scripts/migrate-production-notifications-schema.mjs`

| # | Operation | Collection | Result | Detail |
|---|---|---|---|---|
| 1 | CREATE | `notifications` | **OK** | id=erfmaoadnln4j68 |
| 2 | CREATE | `push_tokens` | **OK** | id=8m326sq1plibdab |

**Safety guards enforced:**
- Host allowlist: `pb.serba.space` only
- Blocked methods: `PATCH`, `PUT`, `DELETE`
- Allowed writes: `POST /api/collections` for `notifications` and `push_tokens` only
- If collection exists → SKIP (no overwrite) — not triggered (both were absent)

**Operations NOT performed:**
- No PATCH to existing collections
- No rule changes on `users`, `profiles`, `leave_requests`, rating, reporting
- No data inserts (no test notifications or tokens)
- No application restart
- No Next.js deploy
- No mobile/APK build

Full log: `docs/PHASE_26A_PRODUCTION_MIGRATION_LOG.json`

---

## Post-Migration Verification

### Schema compatibility (vs Phase 24/25 Local/Staging)

| Check | notifications | push_tokens |
|---|---|---|
| All 9 / 6 required fields present | ✓ | ✓ |
| `listRule` matches Phase 24/25 | ✓ | ✓ |
| `viewRule` matches Phase 24/25 | ✓ | ✓ |
| `createRule` matches Phase 24/25 | ✓ (`null`) | ✓ (`@request.auth.id != ""`) |
| `updateRule` matches Phase 24/25 | ✓ | ✓ |
| `deleteRule` = null | ✓ | ✓ |

### Phase 22 production schema verification

`scripts/verify-production-schema.mjs`: **88/88 PASS** (no conflicts, no missing fields on existing collections)

---

## Existing Data Integrity

| Collection | Pre-Migration | Post-Migration | Delta |
|---|---|---|---|
| `users` | 23 | 23 | 0 ✓ |
| `profiles` | 23 | 23 | 0 ✓ |
| `leave_requests` | 34 | 34 | 0 ✓ |
| `notifications` | N/A (absent) | **0** | New collection ✓ |
| `push_tokens` | N/A (absent) | **0** | New collection ✓ |

No test users, tokens, or notifications were inserted.

---

## Existing Rules

Compared via `verify-production-schema.mjs` against `docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json`:

| Collection | Result |
|---|---|
| `users` | IDENTICAL to Phase 21 snapshot ✓ |
| `profiles` | IDENTICAL to Phase 21 snapshot ✓ |
| `leave_requests` | IDENTICAL to Phase 21 snapshot ✓ |
| All 9 HR collections (rating + reporting) | Rules all null (admin-only) ✓ |

New collections (`notifications`, `push_tokens`) have user-scoped rules as specified in Phase 24 — no impact on existing collections.

---

## Production Safety

### PM2 processes (verified via SSH)

| Process | PID | Uptime | Restarts | Status |
|---|---|---|---|---|
| `erp-system` (production Next.js) | 228060 | **31D** | 0 | online ✓ UNTOUCHED |
| `pb-erp` (production PocketBase) | 228058 | **31D** | 0 | online ✓ NOT RESTARTED |
| `shop-system` | 228059 | **31D** | 0 | online ✓ UNTOUCHED |

### What changed

| Item | Changed? |
|---|---|
| Production PocketBase schema | **YES** — 2 new collections only |
| Production PocketBase data (existing) | **NO** |
| Production PocketBase rules (existing) | **NO** |
| Production Next.js application | **NO** |
| Production mobile/APK | **NO** |
| Git (commit/push) | **NO** |

---

## Final Status

```
✅ READY TO RESUME PHASE 26
```

| Criterion | Status |
|---|---|
| `notifications` CREATED | **PASS** ✓ |
| `push_tokens` CREATED | **PASS** ✓ |
| Schema verification PASS | **PASS** ✓ |
| Rules correct (Phase 24/25 match) | **PASS** ✓ |
| Existing data unchanged | **PASS** ✓ |
| Existing collections unchanged | **PASS** ✓ |
| Existing rules unchanged | **PASS** ✓ |
| No destructive operation | **PASS** ✓ |
| Application untouched | **PASS** ✓ |
| Mobile untouched | **PASS** ✓ |
| Phase 22 verify 88/88 | **PASS** ✓ |

**Phase 26 blocker resolved.** Production application deployment can proceed when Owner approves.

**STOP — Awaiting Owner review before resuming Phase 26 application deployment.**

No application deploy. No APK build. No production notification/push tests sent.
