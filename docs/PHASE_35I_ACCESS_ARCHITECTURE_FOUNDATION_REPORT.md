# Phase 35I — Access Architecture Foundation Report

**Status:** Complete (foundation only — awaiting Owner UAT)  
**Scope:** LOCAL ONLY — no staging/production/APK  
**Date:** 2026-09-01

---

## 1. Existing Architecture

Before Phase 35I, ERP access used:

| Layer | Mechanism |
|-------|-----------|
| Web routes | `role_code` → `ROLE_ACCESS_BY_CODE` + optional `inventory_role` paths |
| Capabilities | In-code registries (`lib/capabilities/*`) derived from `role_code` |
| Entity scope | `biz_user_companies` for HR data scope |
| Meja Kerja (35H) | `canAccess(path)` on static desk config |

**Gap:** No per-user additive module assignment. Staff + HR required changing `role_code` to `hr`.

---

## 2. GAP

- Single `role_code` per user — not Staff + module additive
- No FULL vs CUSTOM per module
- No per-module entity scope (SELECTED vs ALL)
- No desk configuration separate from module access
- No Owner UI to assign modules (deferred to 35J)
- Finance/Warehouse/POS/Sales/Purchasing coupled to `inventory_role` paths

---

## 3. New Architecture

```
USER
  ↓
STAFF BASE (legacy RBAC — unchanged baseline)
  +
MODULE ASSIGNMENTS (PB SSOT — additive)
  ↓
ACCESS MODE: FULL | CUSTOM
  ↓
ENTITY SCOPE: SELECTED | ALL
  ↓
RESOLVED PATHS + CAPABILITIES + ENTITY SCOPE
  ↓
DESK CONFIG (desk_enabled per assignment)
  ↓
MEJA KERJA (display only — not auth)
```

**Principles:**

- Staff base always from legacy RBAC
- Module grants are **additive only** — never subtract legacy paths
- Meja Kerja is **not** an authorization layer
- No new permission keys invented — uses existing capability registry + `web:/path` grants

---

## 4. Data Model

### PocketBase collections (new)

| Collection | Purpose |
|------------|---------|
| `sys_user_module_assignments` | User ↔ module, access_mode, entity_scope_mode, desk_enabled, is_active |
| `sys_user_module_permissions` | CUSTOM mode permission keys |
| `sys_user_module_entities` | SELECTED entity scope (company relations) |

### Session enrichment (computed, not stored on `users`)

| Field | Purpose |
|-------|---------|
| `module_web_paths` | Additive web path prefixes for middleware |
| `desk_module_ids` | Modules enabled for Meja Kerja |
| `module_assignments_enriched` | Flag: session loader ran (desk uses SSOT path) |

Migration: `npm run migrate:local-hr-phase35i`

**No automatic backfill** — existing users unchanged.

---

## 5. Permission Resolution

1. **Legacy baseline:** `resolveLegacyAllowedPaths(user)` — identical to pre-35I
2. **Module assignments:** loaded from PB via `loadModuleAssignmentsForUser()`
3. **FULL mode:** all catalog permissions + web paths for module
4. **CUSTOM mode:** only selected keys from catalog; web paths from `web:/path` keys only
5. **Merged paths:** `getAllowedPathsForUser()` = legacy + `module_web_paths` from session

Module registry: `lib/access/module-registry.ts`

| Module | Capability source | Web paths |
|--------|-------------------|-----------|
| HR | employee.*, attendance.manage, schedule.*, payslip.*, hr_policy.*, etc. | /hr/* |
| Finance | web:/keuangan/* | /keuangan/* |
| Warehouse | web:/gudang/* | /gudang/*, /wms/* |
| Purchasing | web:/pembelian/* | /pembelian/*, /bisnis/pembelian/* |
| Sales | web:/penjualan/* | /penjualan/*, /bisnis/penjualan/* |
| POS | web:/pos/* | /pos/*, /bisnis/penjualan/* |

---

## 6. Entity Scope Resolution

- **ALL:** resolved company ids = authorized entity universe (`getAccessibleCompanyIds`)
- **SELECTED:** intersection of assignment entities ∩ authorized universe
- Enforcement: `assertModuleEntityAccess()`, `assertCompanyAllowedForModule()`
- Fail closed when scope empty or company not in scope

---

## 7. Module Assignment

- Multiple modules per user supported
- Stored in `sys_user_module_assignments`
- Loaded server-side; enriched on `/api/auth/session`
- Preview API: `GET /api/access/self/effective` (read-only)

---

## 8. Full vs Custom

| Mode | Behavior |
|------|----------|
| **FULL** | All catalog permissions + all module web paths |
| **CUSTOM** | Only `sys_user_module_permissions.permission_key` entries from catalog |

Example on same user: HR FULL + Finance CUSTOM — supported.

---

## 9. Desk Configuration Boundary

- `desk_enabled` on assignment controls Meja Kerja visibility
- Module access without `desk_enabled` → full module via paths, **not** shown in Meja Kerja
- Desk items still filtered by `canAccess()` — cannot bypass permissions
- When session enriched: `resolveDeskModulesFromAccessContext()`; else legacy 35H fallback

---

## 10. Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| No PB collections | Loader returns `[]` — identical to pre-35I |
| No assignments for user | Legacy RBAC only |
| Existing `role_code: hr` | Unchanged — legacy paths still apply |
| Existing `inventory_role` | Unchanged — inventory paths still apply |
| Staff dashboard | Preserved via legacy staff paths |
| Phase 34F–35H | No business logic changes |

**Legacy → new mapping (documentation only — NOT auto-migrated):**

| Legacy | Equivalent assignment (manual, future) |
|--------|--------------------------------------|
| `role_code: hr` | HR module FULL |
| `inventory_role: staff` | Warehouse + Finance path grants (partial) |
| `role_code: staff` only | Staff base only |

---

## 11. Security

| Layer | Enforcement |
|-------|-------------|
| UI | `canAccess()` unchanged signature |
| Route | `middleware.ts` via merged paths in session |
| API | Existing capability asserts + new `assertModuleCapability` / `assertModuleEntityAccess` |
| Entity | Server-side scope maps — not UI-only |
| PB collections | LOCKED rules (admin-managed only) |

Hidden menu ≠ authorization. Direct URL blocked by middleware when paths not granted.

---

## 12. Migration

**Script:** `scripts/migrate-local-hr-phase35i.mjs`  
**Command:** `npm run migrate:local-hr-phase35i`  
**LOCAL ONLY** — blocks staging/production hosts

- Creates 3 collections idempotently
- No data backfill
- No modification of existing user records

---

## 13. Test Results

| Test | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (after TS fix) |
| `test:phase35i-access-architecture` | 38/38 PASS |
| `test:phase35h-staff-role-module-entry` | 42/42 PASS |
| `test:phase35g-final-dashboard` | 28/28 PASS |

Resolver cases covered: Staff only, Staff+HR, Staff+Finance, multi-module, FULL, CUSTOM, entity SELECTED/ALL, desk≠module access, no permission bypass.

---

## 14. Known Limitations

1. **No Owner UI** — assignment CRUD deferred to Phase 35J
2. **HR API still uses `isHrAccount()`** — module capability grants do not yet replace `requireOwnerOrHrApiUser` for all HR APIs
3. **Session refresh required** after assignment changes
4. **Capability-only CUSTOM** does not auto-map to web paths (by design — explicit `web:/path` keys needed for route access)
5. **Middleware** depends on session enrichment — direct PB cookie without session refresh uses legacy paths only until re-login

---

## 15. Next Phase Recommendation (35J)

1. Owner/Super Admin UI: user → module → FULL/CUSTOM → entity scope → desk toggle
2. Wire HR API authorization to check module capabilities where appropriate
3. Assignment CRUD API with audit trail
4. Optional: PB rules for Owner-managed assignment writes

---

## Files Changed / Created

### Created

| File |
|------|
| `lib/access/types.ts` |
| `lib/access/module-registry.ts` |
| `lib/access/resolve-effective-access.ts` |
| `lib/access/legacy-paths.ts` |
| `lib/access/entity-scope.ts` |
| `lib/access/context.ts` |
| `lib/access/collections.ts` |
| `lib/access/assert.ts` |
| `lib/access/desk-config.ts` |
| `lib/access/module-assignments-server.ts` |
| `lib/access/index.ts` |
| `app/api/access/self/effective/route.ts` |
| `scripts/migrate-local-hr-phase35i.mjs` |
| `scripts/test-phase35i-access-architecture.mjs` |
| `scripts/phase35i-resolver-tests.mjs` |
| `docs/PHASE_35I_ACCESS_ARCHITECTURE_FOUNDATION_REPORT.md` |

### Modified

| File | Change |
|------|--------|
| `lib/rbac.ts` | Merge additive `module_web_paths` from session |
| `lib/workspace/resolve-workspace.ts` | Desk SSOT when session enriched |
| `app/api/auth/session/route.ts` | Enrich session with module access |
| `package.json` | migrate + test scripts |

### Removed

None.

---

**STOP — Phase 35I complete. Menunggu Owner UAT. Do not proceed to 35J without approval.**
