# PHASE 35I-A — OWNER UAT / VERIFICATION REPORT

**Date:** 2 September 2026  
**Scope:** Verification only — no code changes, no migration, no deployment  
**Verifier:** Automated regression + static code audit (no browser / no live PocketBase user sessions)

---

## 1. Executive Result

| Layer | Result | Notes |
|-------|--------|-------|
| Automated regression (Phase 35 suite + 35I-A) | **PASS** | 311/311 assertions, 0 failures |
| TypeScript (`tsc --noEmit`) | **PASS** | Exit code 0 |
| Static code audit (enforcement wiring) | **PASS** | HR gate, capability merge, entity INTERSECTION confirmed in source |
| Live browser UAT | **NOT TESTED** | No interactive UI session with test users |
| Live HTTP API UAT (curl/browser against running app) | **NOT TESTED** | No dev-server + PocketBase assignment seed executed in this verification |
| PocketBase assignment CRUD (Owner UI) | **BLOCKED** | No Owner Access Management UI (by design — Phase 35J deferred) |

### Overall recommendation

**CONDITIONAL GO (LOCAL technical verification)** — automated and structural checks pass; core HR enforcement architecture is present and consistent with Phase 35I-A design.

**NO-GO for staging/production** until Owner completes **manual browser + live API UAT** with real users and module assignments created directly in PocketBase.

---

## 2. Test Environment

| Item | Value |
|------|-------|
| Workspace | `b:\Coding\erp-system` (local) |
| OS | Windows 10 |
| Node | via `npm run` scripts |
| Verification method | CLI test scripts + source read-only audit |
| PocketBase | Not connected for live user scenarios |
| Browser | Not used |
| Code modified during verification | **None** |

Commands executed:

```bash
npm run test:phase35i-a-access-enforcement   # 42/42 PASS
npm run test:phase35i-access-architecture  # 38/38 PASS
npm run test:phase35h-staff-role-module-entry # 42/42 PASS
npm run test:phase35g-final-dashboard        # 28/28 PASS
npm run test:phase35f-meja-kerja             # 8/8 PASS
npm run test:phase35e-role-aware-workspace   # 21/21 PASS
npm run test:phase35d-staff-workspace-shell  # 20/20 PASS
npm run test:phase35c-staff-profile-ux       # 25/25 PASS
npm run test:phase35b-profile                # 35/35 PASS
npm run test:phase35-design-system           # 52/52 PASS
npx tsc --noEmit                           # PASS
```

---

## 3. Access Matrix

| Persona | Web HR routes | HR API gate | Capability source | Owner-only caps | Result |
|---------|---------------|-------------|-------------------|-----------------|--------|
| **A. Staff, no assignment** | Denied via `canAccess` (no `module_web_paths`) | `requireHrModuleApiUser` → denied | None | N/A | **PASS** (structural) / **NOT TESTED** (live) |
| **B. Staff + HR FULL** | Allowed via session `module_web_paths` + middleware `canAccess` | Gate passes; caps from registry | `hasEffectiveCapability` + FULL catalog | `employee.activate/deactivate/manage_hr_accounts` excluded from FULL catalog | **PASS** (structural) / **NOT TESTED** (live) |
| **C. Staff + HR CUSTOM** | Only `web:*` grants in CUSTOM | Gate passes; per-capability deny | Only assigned keys in `capabilityKeys` | Unassigned → denied at assert | **PASS** (resolver unit CASE 6) / **NOT TESTED** (live) |
| **D. Legacy HR (`role_code=hr`)** | Legacy paths + bypass | `isOwnerOrHrAccount` short-circuit | Legacy `lib/capabilities/*` | Unchanged owner-only registry | **PASS** (structural) / **NOT TESTED** (live) |
| **E. Owner** | `canAccess` → `*` | Owner bypass in gate | Legacy owner caps | Full owner registry | **PASS** (structural) / **NOT TESTED** (live) |
| **F. Staff + Finance/Warehouse only** | Module paths for assigned module only | HR API denied without HR assignment | N/A for HR | N/A | **PASS** (structural) / **NOT TESTED** (live) |

### A. Staff tanpa HR — detail

| Check | Method | Result |
|-------|--------|--------|
| HR web route denied | Resolver CASE 1: no assignment → no module paths | **PASS** |
| HR API denied | `requireHrModuleApiUser` throws `ModuleAccessError` when no active HR assignment | **PASS** (code audit) |
| `desk_enabled` alone does not grant HR capability | `desk-config.ts` uses `canAccess`; desk is not auth layer (35I-A test CASE 14–15) | **PASS** |
| Live navigation to `/hr` blocked | Browser | **NOT TESTED** |
| Live `GET /api/hr/employees` → 403 | HTTP | **NOT TESTED** |

### B. Staff + HR FULL — detail

| Check | Method | Result |
|-------|--------|--------|
| `role_code` remains `staff` | No code forces role change; assignment is additive | **PASS** (design) / **NOT TESTED** (live user record) |
| HR web routes accessible | Resolver CASE 2: FULL grants `/hr`, `employee.view` | **PASS** |
| HR API gate open | `hasActiveHrModuleAssignment` → `requireHrModuleApiUser` passes | **PASS** (code audit) |
| HR registry capabilities available | FULL catalog in `module-registry.ts` | **PASS** |
| `employee.activate` denied | Excluded from `HR_FULL_CAPABILITIES` + `EMPLOYEE_CAPABILITY_DEFS.grantedTo: ["owner"]` | **PASS** |
| `employee.deactivate` denied | Same exclusion | **PASS** |
| `employee.manage_hr_accounts` denied | Same exclusion + `assertCanManageTargetAccount` | **PASS** |
| Live employee create/list | HTTP | **NOT TESTED** |

### C. Staff + HR CUSTOM — detail

| Check | Method | Result |
|-------|--------|--------|
| Assigned capability allowed | Resolver CASE 6: `employee.view` present | **PASS** |
| Unassigned capability denied | Resolver CASE 6: `employee.create` absent | **PASS** |
| Menu hidden ≠ security | Documented; enforcement is server-side `assertEmployeeCapability` | **PASS** (design) |
| Live CUSTOM user with only `employee.view` cannot POST employee | HTTP | **NOT TESTED** |

---

## 4. Entity Scope Verification

### Design (confirmed in source)

```
resolveModuleEntityScope (SELECTED):
  entityCompanyIds.filter(id => authorizedEntityIds.includes(id))
  → INTERSECTION, not UNION

getHrEffectiveCompanyIds:
  moduleScope.companyIds.filter(id => membership.includes(id))
  → second INTERSECTION at API layer
```

### Scenario: membership PT A + PT B, HR SELECTED PT A

| Entity | Expected | Resolver test (co-a in scope, co-b out) | Live API | Result |
|--------|----------|-------------------------------------------|----------|--------|
| PT A | Allowed | CASE 7: PT A in `companyIds` | — | **PASS** (unit) |
| PT B | Denied / 403 | CASE 7: PT B excluded | — | **PASS** (unit) |
| Live `companyId=PT-B` on holiday/policy mutation | 403 | — | HTTP | **NOT TESTED** |

### Scenario: membership PT A + PT B, HR ALL

| Entity | Expected | Resolver test | Result |
|--------|----------|---------------|--------|
| PT A | Allowed | CASE 8: ALL → all `authorizedEntityIds` | **PASS** (unit) |
| PT B | Allowed | CASE 8 | **PASS** (unit) |
| PT C (not in membership) | Denied | ALL = authorized universe only, not entire DB | **PASS** (design) / **NOT TESTED** (live) |

### UNION vs INTERSECTION

| Check | Result |
|-------|--------|
| SELECTED filters assignment ids against `authorizedEntityIds` | **PASS** (`entity-scope.ts:23`) |
| API layer re-intersects with `ctx.companyIds` | **PASS** (`hr-api-enforcement.ts:88`) |
| No code path found that UNION-expands scope | **PASS** (audit) |

---

## 5. Direct API Verification

Verification via **structural/code audit + automated tests** — not live HTTP.

| API area | Enforcement mechanism | Staff no HR | Staff+HR FULL | Staff+HR CUSTOM | Legacy HR | Result |
|----------|----------------------|-------------|---------------|-------------------|-----------|--------|
| `requireOwnerOrHrApiUser` routes (~20) | `requireHrModuleApiUser` | Denied | Allowed (gate) | Allowed (gate) | Allowed | **PASS** (gate wiring) |
| `/api/hr/employees` | `assertEmployeeCapability` + effective cap | Denied | Allowed if cap | Allowed if cap assigned | Allowed | **PASS** (structural) |
| `/api/hr/holidays` | `hasEffectiveHrPolicyCapability` + entity | Denied | Allowed | Allowed if `hr_policy.manage` | Allowed | **PASS** (structural) |
| `/api/hr/policies` | Same | Denied | Allowed | Cap-dependent | Allowed | **PASS** (structural) |
| `/api/hr/attendance-policies` | Same | Denied | Allowed | Cap-dependent | Allowed | **PASS** (structural) |
| Leave approve/reject | `assertHrAdminSurface` (FULL or legacy only) | Denied | Allowed (FULL) | **Denied** (CUSTOM without mapped cap) | Allowed | **PASS** (by design) |
| `/api/hr/rating/*` | `ctx.isHr` only — **not migrated** | Denied | **Denied** (Staff+HR module blocked) | Denied | Allowed | **FAIL** (known gap) |
| `/api/hr/reports/*`, findings | `ctx.isHr` in `reporting-server.ts` | Denied | **Likely denied** | Denied | Allowed | **FAIL** (known gap) |
| Payroll bank requests | `ctx.isHr` in `payroll-bank-account-server.ts` | Denied | **Likely denied** | Denied | Allowed | **FAIL** (known gap) |
| Finance APIs | No finance API layer | N/A | N/A | N/A | N/A | **NOT TESTED** |
| Warehouse `/api/inventory/*` | `inventory_role` (unchanged) | N/A | N/A | N/A | N/A | **NOT TESTED** |

### Direct API bypass (conceptual)

| Attack vector | Expected | Code evidence | Live test | Result |
|---------------|----------|---------------|-----------|--------|
| Staff calls HR API without assignment | 403 | `ModuleAccessError` in gate | — | **PASS** (structural) |
| Staff+HR CUSTOM calls unassigned capability | 403 | `hasEffectiveCapability` fail closed | — | **PASS** (structural) |
| Cross-entity `companyId` | 403 | `assertHrModuleEntityAccess` | — | **PASS** (structural) |
| `desk_enabled=true` without assignment | No HR API access | Desk not in auth path | — | **PASS** (structural) |

---

## 6. Web Route Verification

| Check | Mechanism | Automated | Browser | Result |
|-------|-----------|-----------|---------|--------|
| Legacy paths preserved | `resolveLegacyAllowedPaths` | 35I test | — | **PASS** |
| Module paths additive | `canAccess` merges `module_web_paths` | 35I test | — | **PASS** |
| Staff no assignment → `/hr` denied | No module paths | Resolver CASE 1 | — | **PASS** (unit) |
| Staff+HR FULL → `/hr` allowed | Module paths include `/hr` | Resolver CASE 2 | — | **PASS** (unit) |
| Direct URL `/hr/employees` without permission | Middleware `canAccess` | Structural | — | **PASS** (design) |
| Operational web access for Staff+module | `hasModuleOperationalPathAccess` | 35I-A test | — | **PASS** (structural) |
| Web access ≠ full API capability | Separate middleware vs API asserts | Documented | — | **PASS** (design) |
| Live browser navigation all personas | — | — | — | **NOT TESTED** |

---

## 7. desk_enabled Verification

| Check | Expected | Evidence | Result |
|-------|----------|----------|--------|
| `desk_enabled=true` → Meja Kerja visibility only | Display/config | `desk-config.ts`, 35I CASE 9–10 | **PASS** |
| `desk_enabled=false` → module auth remains if assignment active | Authorization independent | `hasActiveHrModuleAssignment` does not read `deskEnabled` | **PASS** |
| `desk_enabled` does not add capabilities | No cap grant from desk | Desk tests + code audit | **PASS** |
| Live Meja Kerja UI with desk on/off | Browser | — | **NOT TESTED** |

---

## 8. Owner / Legacy HR Verification

| Check | Expected | Evidence | Live | Result |
|-------|----------|----------|------|--------|
| Owner full access (legacy) | Unchanged | `isOwner` bypass in gate; `canAccess` → `*` | — | **PASS** (structural) |
| Module assignment does not narrow Owner | `getHrEffectiveCompanyIds` returns full membership for owner | `hr-api-enforcement.ts:80` | — | **PASS** |
| Legacy `role_code=hr` without assignment | HR gate + legacy caps | `isOwnerOrHrAccount` short-circuit | — | **PASS** (structural) |
| Legacy HR behavior unchanged | No role_code mutation | Code audit | — | **PASS** (design) |
| Live Owner session | Browser/API | — | **NOT TESTED** |
| Live legacy HR user session | Browser/API | — | **NOT TESTED** |

---

## 9. Regression Results

| Suite | Passed | Failed | Result |
|-------|--------|--------|--------|
| `test:phase35i-a-access-enforcement` | 42 | 0 | **PASS** |
| `test:phase35i-access-architecture` | 38 | 0 | **PASS** |
| `test:phase35h-staff-role-module-entry` | 42 | 0 | **PASS** |
| `test:phase35g-final-dashboard` | 28 | 0 | **PASS** |
| `test:phase35f-meja-kerja` | 8 | 0 | **PASS** |
| `test:phase35e-role-aware-workspace` | 21 | 0 | **PASS** |
| `test:phase35d-staff-workspace-shell` | 20 | 0 | **PASS** |
| `test:phase35c-staff-profile-ux` | 25 | 0 | **PASS** |
| `test:phase35b-profile` | 35 | 0 | **PASS** |
| `test:phase35-design-system` | 52 | 0 | **PASS** |
| **Total** | **311** | **0** | **PASS** |
| `npx tsc --noEmit` | — | — | **PASS** |

No code was modified as a result of any failure (none occurred).

---

## 10. Known Gaps (pre-existing / documented, not fixed in this verification)

| # | Gap | Impact on UAT | Status |
|---|-----|---------------|--------|
| 1 | `rating-server.ts` still uses `ctx.isHr` | Staff+HR FULL cannot use rating API despite HR module | **FAIL** (partial coverage) |
| 2 | `reporting-server.ts` still uses `ctx.isHr` | Staff+HR module cannot manage findings/reports API | **FAIL** (partial coverage) |
| 3 | `payroll-bank-account-server.ts` still uses `ctx.isHr` | Staff+HR module cannot use payroll-bank API | **FAIL** (partial coverage) |
| 4 | `leave.approve` not in HR module catalog | CUSTOM HR cannot approve leave (by `assertHrAdminSurface`) | **PASS** (intentional fail-closed) |
| 5 | Finance / Warehouse API not module-integrated | Module assignment does not affect inventory APIs | **NOT TESTED** / deferred |
| 6 | No Owner UI for assignments | Manual UAT requires direct PocketBase edits | **BLOCKED** |
| 7 | Session snapshot stale after assignment change | Requires re-login / session refresh | **NOT TESTED** (documented) |
| 8 | Live browser/API UAT | Owner personas not exercised end-to-end | **NOT TESTED** |

---

## 11. GO / NO-GO Recommendation

### GO ✅ (with conditions)

- **Local technical baseline:** All 311 automated tests pass; TypeScript clean; core HR enforcement (gate, effective capability, entity INTERSECTION) verified in source.
- **Safe to proceed with Owner manual UAT** on local environment using PocketBase-direct module assignments.

### Conditions before staging/production

1. Owner completes **live browser UAT** for personas A–F (minimum checklist in Section 3).
2. Owner completes **live API UAT** with curl/DevTools for at least: staff denied, staff+HR FULL allowed, staff+HR CUSTOM cap deny, cross-entity 403.
3. Acknowledge **partial API coverage** — rating, reporting, payroll-bank still legacy `isHr` only (Staff+HR module users will be blocked on those endpoints until 35I-B).
4. Create test users + assignments in PocketBase manually (no Owner UI).

### NO-GO ❌

- **Staging / production deployment** — until manual UAT complete and gaps above accepted or resolved in a future phase.
- **Claiming full HR API coverage for Staff+HR module** — rating/reporting/payroll-bank endpoints are not yet migrated.

---

## Appendix — Owner Manual UAT Checklist (for live session)

Use when PocketBase assignments are configured manually. Mark each PASS/FAIL during browser session.

- [ ] Staff, no assignment: `/hr` → blocked; `GET /api/hr/holidays` → 403
- [ ] Staff + HR FULL: `/hr` → allowed; `GET /api/hr/employees` → 200; `role_code` still `staff`
- [ ] Staff + HR FULL: activate employee → 403
- [ ] Staff + HR CUSTOM (`employee.view` only): list employees → 200; create employee → 403
- [ ] Entity SELECTED PT A only: mutation with PT B `company_id` → 403
- [ ] Entity ALL: PT A and PT B allowed (within membership)
- [ ] Legacy HR without assignment: full HR access unchanged
- [ ] Owner: unrestricted per legacy
- [ ] `desk_enabled=false` + HR FULL: API still works; Meja Kerja HR hidden
- [ ] Session refresh after assignment change

---

**Verification completed without source-code modification.**  
**Next step:** Owner manual UAT on local PocketBase — not Phase 35I-B implementation.
