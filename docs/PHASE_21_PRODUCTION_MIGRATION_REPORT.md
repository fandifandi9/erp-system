# Phase 21 — Production Schema Migration Report

## Final Status

```
SCHEMA MIGRATION PASS
```

---

## Migration Timestamp

| Event | Timestamp (UTC) |
|---|---|
| Migration started | 2026-08-28T06:18:28.904Z |
| Authentication | 2026-08-28T06:18:29.6xx Z |
| Pre-migration snapshot | 2026-08-28T06:18:30.xxx Z |
| All operations complete | 2026-08-28T06:18:40.xxx Z |
| Post-migration verification | 2026-08-28T06:18:41–56 Z |
| Dry-run re-check | 2026-08-28T06:18:56.055Z |

---

## Production Target

| Property | Value |
|---|---|
| PocketBase URL | `https://pb.serba.space` |
| Application | NOT TOUCHED |
| Mobile | NOT TOUCHED |
| Deployment | NOT DONE |
| Build | NOT DONE |

---

## Pre-Migration Snapshot

- **Total collections before migration:** 93
- **Snapshot file:** `docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json`
- **Record counts file:** `docs/PHASE_21_PRODUCTION_RECORD_COUNTS_BEFORE.json`

### Record Counts Before Migration

| Collection | Count |
|---|---|
| `users` | 23 |
| `leave_requests` | 34 |
| `profiles` | 23 |

---

## Migration Operations

### Source of Truth

- `docs/PHASE_20_PRODUCTION_SCHEMA_SAFETY_REPORT.md` — primary migration plan
- `docs/_dry_run_result.json` — Phase 20 pre-verified dry-run results
- `scripts/migrate-production-schema.mjs` — idempotent executor (Phase 21)

### Operation Summary

| Category | Count |
|---|---|
| Collections created | **9** |
| Fields added | **13** |
| Collections skipped (already existed) | 0 |
| Fields skipped (already existed) | 0 |
| Conflicts detected | **0** |
| Blockers triggered | **0** |
| Destructive operations | **0** |
| STOP conditions triggered | **0** |

---

## New Collections Created

All 9 collections created with `null` rules (admin-only) as required by Phase 20.

### HR Rating Collections

| Step | Collection | Fields | Status |
|---|---|---|---|
| D1 | `hr_rating_periods` | 6 | ✓ CREATED |
| D2 | `hr_rating_aspects` | 7 | ✓ CREATED |
| D3 | `hr_rating_assignments` | 7 | ✓ CREATED |
| D4 | `hr_rating_reviewers` | 6 | ✓ CREATED |
| D5 | `hr_rating_scores` | 4 | ✓ CREATED |
| D6 | `hr_rating_results` | 10 | ✓ CREATED |

Creation order: D1 → D2 → D3 (uses periodsId) → D4 (uses assignmentsId) → D5 (uses reviewersId+aspectsId) → D6 (uses assignmentsId)

### HR Reporting Collections

| Step | Collection | Fields | Status |
|---|---|---|---|
| C1 | `hr_staff_reports` | 12 | ✓ CREATED |
| C2 | `hr_findings` | 12 | ✓ CREATED |
| C3 | `hr_case_attachments` | 7 (incl. `file`) | ✓ CREATED |

---

## New Fields Added

### `users` Collection — 4 fields added

| Field | Type | Required | Status |
|---|---|---|---|
| `mobile_session_nonce` | `text` | false | ✓ ADDED |
| `account_type` | `select` (owner/user) | false | ✓ ADDED |
| `role_code` | `text` | false | ✓ ADDED |
| `dashboard_access` | `bool` | false | ✓ ADDED |

### `leave_requests` Collection — 9 fields added

| Field | Type | Required | Status |
|---|---|---|---|
| `start_date` | `text` | false | ✓ ADDED |
| `end_date` | `text` | false | ✓ ADDED |
| `reason` | `text` | false | ✓ ADDED |
| `division` | `text` | false | ✓ ADDED |
| `position` | `text` | false | ✓ ADDED |
| `booking_date` | `text` | false | ✓ ADDED |
| `daily_compensation_rate` | `number` | false | ✓ ADDED |
| `compensation_amount` | `number` | false | ✓ ADDED |
| `rejection_reason` | `text` | false | ✓ ADDED |

---

## Existing Collections Preserved

The following collections were verified to exist before migration and were not modified in any destructive way:

- All 93 pre-existing collections remain intact
- No collection was deleted, recreated, or renamed
- Schema patch operations (PATCH /api/collections/:id) preserved all existing fields in the full schema array; only new fields were appended

---

## Existing Fields Preserved

- No existing field was modified, renamed, or removed from any collection
- PATCH operations on `users` and `leave_requests` used a merged schema: `[...existing_fields, ...new_fields]`
- Type conflict check ran before each PATCH — result: 0 conflicts

---

## Existing Rules Preserved

Production rules for all existing collections were captured before migration and compared after:

### `users` Rules — Before = After

```
listRule:   "@request.auth.id != \"\" && (id = @request.auth.id || @request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.role_code = \"owner\" || @request.auth.account_type = \"owner\")"
viewRule:   "@request.auth.id != \"\" && (id = @request.auth.id || @request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.role_code = \"owner\" || @request.auth.account_type = \"owner\")"
createRule: "@request.auth.id != \"\" && (@request.auth.role = \"hr\" || @request.auth.role_code = \"hr\" || @request.auth.role = \"owner\" || @request.auth.role_code = \"owner\" || @request.auth.account_type = \"owner\")"
updateRule: "@request.auth.id != \"\" && (... self-update guard + HR/owner override ...)"
deleteRule: "@request.auth.id != \"\" && (@request.auth.role = \"owner\" || @request.auth.role_code = \"owner\" || @request.auth.account_type = \"owner\")"
```

**Comparison result:** IDENTICAL ✓

### `leave_requests` Rules — Before = After

```
listRule:   "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"hr\" || ...)"
viewRule:   "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"hr\" || ...)"
createRule: null
updateRule: null
deleteRule: null
```

**Comparison result:** IDENTICAL ✓

### `profiles` Rules — Before = After

```
listRule, viewRule, createRule, updateRule — authenticated user-scoped + HR/owner rules
deleteRule — owner only
```

**Comparison result:** IDENTICAL ✓

### `biz_activity_events` and `sys_audit_log`

Not touched. Rules not modified. (Phase 19 noted open rules — security hardening is a separate phase per Phase 21 scope.)

---

## Record Counts Before / After

| Collection | Before | After | Delta | Status |
|---|---|---|---|---|
| `users` | 23 | 23 | 0 | ✓ UNCHANGED |
| `leave_requests` | 34 | 34 | 0 | ✓ UNCHANGED |
| `profiles` | 23 | 23 | 0 | ✓ UNCHANGED |

No new records written. No existing records modified. No backfill performed.

---

## Attachment Schema Verification

### `hr_case_attachments.file`

| Property | Expected | Actual | Status |
|---|---|---|---|
| Field name | `file` | `file` | ✓ |
| Field type | `file` | `file` | ✓ |
| `maxSize` | 10485760 (10 MB) | 10485760 | ✓ |
| `mimeTypes[0]` | `image/jpeg` | `image/jpeg` | ✓ |
| `mimeTypes[1]` | `image/png` | `image/png` | ✓ |
| `mimeTypes[2]` | `image/webp` | `image/webp` | ✓ |
| Public access | NO | Rules: null (admin-only) | ✓ |

Access path: `authenticated Next.js API → adminPb client → PocketBase`
Unauthenticated direct PocketBase access: **403/401** (rules: null)

---

## Security Verification

### New Collection Rules — All Admin-Only

| Collection | listRule | viewRule | createRule | updateRule | deleteRule |
|---|---|---|---|---|---|
| `hr_rating_periods` | null | null | null | null | null |
| `hr_rating_aspects` | null | null | null | null | null |
| `hr_rating_assignments` | null | null | null | null | null |
| `hr_rating_reviewers` | null | null | null | null | null |
| `hr_rating_scores` | null | null | null | null | null |
| `hr_rating_results` | null | null | null | null | null |
| `hr_staff_reports` | null | null | null | null | null |
| `hr_findings` | null | null | null | null | null |
| `hr_case_attachments` | null | null | null | null | null |

Security rationale per Phase 20:
- **Rating collections:** Subject identity of reviewer is hidden; access controlled via `adminPb` from Next.js API routes only
- **Reporting/Findings:** Employees do not see findings; HR/Owner RBAC enforced at Next.js API layer
- **Attachments:** No public URL; file access gated behind authenticated Next.js API; `null` rules prevent direct PocketBase access

---

## Destructive Operations

**Expected: NONE**
**Actual: NONE**

No `DELETE`, `DROP`, `REMOVE FIELD`, `CLEAR`, `PURGE`, or `RECREATE EXISTING COLLECTION` operations were performed. The migration executor had no destructive code paths.

---

## Application Deployment

**Expected: NOT DONE**
**Actual: NOT DONE**

No `npm run build`, `npm run deploy`, `pm2 restart`, git push to deployment remote, Next.js deployment, or mobile deployment was performed.

---

## Mobile Deployment

**Expected: NOT DONE**
**Actual: NOT DONE**

---

## Post-Migration Dry-Run Re-Check

Immediately after migration, the Phase 20 dry-run checker was re-executed against Production:

```
CREATE COLLECTION (0):    ← all 9 already exist
ADD FIELD          (0):   ← all 13 already added
KEEP EXISTING     (22):   ← all items verified correct
CONFLICTS          (0):
BLOCKERS           (0):
```

**Result: PERFECT SYNC. No remaining action items.**

---

## Phase 21 Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | 9 required collections exist | ✅ PASS |
| 2 | 4 users fields exist | ✅ PASS |
| 3 | 9 leave_requests fields exist | ✅ PASS |
| 4 | `hr_case_attachments.file` exists | ✅ PASS |
| 5 | Attachment configuration correct (10 MB, 3 mimeTypes) | ✅ PASS |
| 6 | Existing Production fields unchanged | ✅ PASS |
| 7 | Existing Production rules unchanged | ✅ PASS |
| 8 | users record count unchanged (23→23) | ✅ PASS |
| 9 | profiles record count unchanged (23→23) | ✅ PASS |
| 10 | leave_requests record count unchanged (34→34) | ✅ PASS |
| 11 | No destructive operation | ✅ PASS |
| 12 | Migration log complete | ✅ PASS |
| 13 | Before/after schema comparison PASS | ✅ PASS |
| 14 | Production application NOT deployed | ✅ PASS |
| 15 | Mobile NOT deployed | ✅ PASS |
| 16 | No unexpected Production restart | ✅ PASS |

**All 16 criteria: PASS**

---

## Output Files

| File | Purpose |
|---|---|
| `docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json` | Full pre-migration schema snapshot (93 collections) |
| `docs/PHASE_21_PRODUCTION_RECORD_COUNTS_BEFORE.json` | Record counts before migration |
| `docs/PHASE_21_PRODUCTION_MIGRATION_LOG.json` | Per-operation migration log |
| `docs/PHASE_21_PRODUCTION_MIGRATION_REPORT.md` | This report |
| `docs/_dry_run_result.json` | Phase 20 dry-run result (updated by post-migration re-check) |
| `scripts/migrate-production-schema.mjs` | Migration executor (additive, idempotent) |
