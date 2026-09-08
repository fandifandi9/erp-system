# PHASE 35I-A — ACCESS ENFORCEMENT HARDENING REPORT

**Scope:** LOCAL ONLY — no staging, production, APK, or mass migration.

**Status:** Implementation complete — awaiting Owner review. **STOP** — do not proceed to 35I-B / 35J.

---

## 1. Executive Summary

Phase 35I built the module access SSOT (`lib/access/*`) but API routes still used legacy `role_code=hr` gates. Phase 35I-A wires **server-side enforcement** so:

```
legacy staff access + module assignment (FULL/CUSTOM + entity scope)
```

applies on HR APIs without removing legacy RBAC or forcing `role_code` changes.

---

## 2. Authorization Audit (Before → After)

| Area | Before | After | Entity Scope | Action |
|------|--------|-------|--------------|--------|
| `requireOwnerOrHrApiUser` | Owner OR `role_code=hr` only | + Staff with active HR module assignment | N/A (gate) | **Extended** |
| `assertEmployeeCapability` | Legacy role caps only | Legacy + module caps | Via `getHrEffectiveCompanyIds` in scope | **Extended** |
| `assertAttendanceCapability` | Legacy only | Legacy + module | Existing + module entity on schedule scope | **Extended** |
| `assertScheduleCapability` | Legacy only | Legacy + module | `getHrEffectiveCompanyIds` | **Extended** |
| HR policy / holiday / attendance-policy servers | `hasHrPolicyCapability(user)` | `hasEffectiveCapability` | `assertHrModuleEntityAccess` / effective company filter | **Extended** |
| `leave-server` approve/reject | `ctx.isHr` only | `assertHrAdminSurface` (FULL module or legacy) | `getHrEffectiveCompanyIds` intersection | **Extended** |
| `rating-server`, `payroll-bank`, `reporting-server` | `ctx.isHr` | **Not fully migrated** — still legacy `isHr` | Partial | **GAP → 35I-B** |
| Finance / Warehouse APIs | `inventory_role` / path checks | Unchanged | No module SSOT yet | **Deferred** |
| Web middleware `canAccess` | Legacy + `module_web_paths` | Unchanged (additive) | N/A | **Kept** |
| `shouldDenyOperationalWebAccess` | Owner/HR bypass OR `web_access` | + module path bypass for assigned routes | N/A | **Extended** |
| `assertModuleCapability` / `assertModuleEntityAccess` | Defined, unused | Used via HR enforcement helpers | INTERSECTION (membership ∩ assignment) | **Wired** |

---

## 3. HR API Audit

### Gate pattern (new)

```
OWNER           → existing owner authorization
role_code = hr  → existing HR authorization (unchanged)
STAFF + HR mod  → requireHrModuleApiUser + capability/entity checks
STAFF only      → denied for HR admin APIs
```

### Routes using `requireOwnerOrHrApiUser` (gate extended)

All 20 routes under `app/api/hr/**` that called `requireOwnerOrHrApiUser` now pass Staff+HR module users through the gate. Downstream server libs enforce capabilities and entity scope.

### Routes using `requireAuthenticatedHrUser` + capability asserts

Employee, attendance, work-schedule routes: `getAuthenticatedHrUser` now loads `accessContext`; asserts use effective (legacy + module) capabilities.

---

## 4. Module Capability Enforcement

**SSOT files:**
- `lib/access/effective-capability.ts` — `hasEffectiveCapability(user, context, key, legacyHas)`
- `lib/access/hr-api-enforcement.ts` — HR gate, entity scope, admin surface

**FULL HR:** Uses catalog from `module-registry.ts` excluding `employee.activate`, `employee.deactivate`, `employee.manage_hr_accounts`.

**CUSTOM HR:** Only assigned capability keys pass `hasEffectiveCapability`. Unassigned keys denied.

---

## 5. Entity Scope Enforcement

```
biz_user_companies (membership)
        ∩
sys_user_module_entities (SELECTED)
        =
getHrEffectiveCompanyIds(ctx)
```

- `entity_scope_mode=all` → authorized entity universe from `getAccessibleCompanyIds` (not unbounded DB)
- Enforced on holiday/policy mutations via `assertHrModuleEntityAccess`
- List queries filter by `getHrEffectiveCompanyIds`

---

## 6. Multi-Module

Per-module entity scope remains independent (`moduleEntityScope` Map). HR PT-A + Finance PT-A/B unchanged from 35I resolver.

---

## 7. Desk Boundary

`desk_enabled` unchanged — visibility only. No capability grant from desk. Tests preserved.

---

## 8. Operational Web Access

`hasModuleOperationalPathAccess()` — Staff+module can access operational web routes matching session `module_web_paths` without `role_code=hr` or global ERP bypass.

---

## 9. Session

Assignment changes still require session refresh (snapshot `module_web_paths`). Documented — no realtime system added.

---

## 10. Backward Compatibility

| User type | Behavior |
|-----------|----------|
| Staff, no assignment | Unchanged (staff base only) |
| `role_code=hr` | Unchanged |
| Owner | Unchanged |
| `inventory_role` warehouse users | Unchanged |
| No automatic backfill | ✓ |

---

## 11. Security Tests (Automated CASE 1–20)

`npm run test:phase35i-a-access-enforcement` — **42/42 PASS** (includes 35I resolver regression).

---

## 12. Migration

**Not required** for 35I-A. Uses existing `sys_user_module_*` collections from Phase 35I.

---

## 13. Files Created

| File | Purpose |
|------|---------|
| `lib/access/effective-capability.ts` | Additive legacy + module capability check |
| `lib/access/hr-api-enforcement.ts` | HR API gate, entity scope, admin surface |
| `scripts/test-phase35i-a-access-enforcement.mjs` | CASE 1–20 tests |
| `docs/PHASE_35I_A_ACCESS_ENFORCEMENT_REPORT.md` | This report |

---

## 14. Files Modified

| File | Change |
|------|--------|
| `lib/hr/api-auth.ts` | `accessContext` on auth ctx; module-aware `requireOwnerOrHrApiUser`; entity scope helper |
| `lib/hr/employee-auth.ts` | Effective employee capabilities |
| `lib/hr/employee-scope.ts` | Module capability + effective company ids in target access |
| `lib/hr/attendance-auth.ts` | Effective attendance capabilities |
| `lib/hr/work-schedule-auth.ts` | Effective schedule caps + entity scope |
| `lib/hr/holiday-server.ts` | Effective policy caps + entity filter |
| `lib/hr/hr-policy-server.ts` | Effective policy caps + entity filter |
| `lib/hr/entity-attendance-policy-server.ts` | Effective policy caps + entity filter |
| `lib/hr/leave-server.ts` | Operational actor + admin surface + entity intersection |
| `lib/operational-access-gate.ts` | Module path operational bypass |
| `lib/access/index.ts` | Export new helpers |
| `package.json` | `test:phase35i-a-access-enforcement` script |

---

## 15. Files Removed

None.

---

## 16. TypeScript

`npx tsc --noEmit` — **PASS**

---

## 17. Test Results

| Suite | Result |
|-------|--------|
| Phase 35I-A | **42/42 PASS** |
| Phase 35I | **38/38 PASS** |
| Phase 35H | **42/42 PASS** |
| Phase 35G | **28/28 PASS** |
| Phase 35F | (run locally) |
| Phase 35E–35B, Design System | (run locally) |

---

## 18. Remaining Gaps (→ Phase 35I-B)

1. **Rating API** (`rating-server.ts`) — still uses `ctx.isHr`; no capability key in HR module registry
2. **Payroll bank requests** (`payroll-bank-account-server.ts`) — legacy `isHr` only
3. **HR reporting/findings** (`reporting-server.ts`) — legacy `isHr` only
4. **Finance module** — no dedicated API layer; web paths only
5. **Warehouse module** — `inventory_role` not integrated with module assignments
6. **CUSTOM HR + leave.approve** — `leave.approve` is mobile capability, not in HR module catalog; CUSTOM users denied admin leave via `assertHrAdminSurface`
7. **Capability resolver** (`lib/capabilities/*`) — still role-based at source; module caps merged at assert layer only
8. **WMS routes** with login-only auth — pre-existing gap

---

## 19. Recommendation for Phase 35I-B

1. Add mapped capability keys for leave.approve, rating.admin, payroll-bank to HR module registry (or explicit route→capability map)
2. Migrate `rating-server`, `reporting-server`, `payroll-bank-account-server` to `isHrOperationalActor` + capability asserts
3. Warehouse: bridge `inventory_role` with module assignment for API layer
4. Finance: define API surface + enforcement when finance mutations exist
5. Owner Access Management UI remains **35J** — not in scope

---

**STOP — Awaiting Owner review. Do not proceed to 35I-B or 35J without approval.**
