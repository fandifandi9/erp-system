# Phase 32 — RBAC & Employee Management Hardening

**Date:** 2026-08-31  
**Mode:** LOCAL IMPLEMENTATION ONLY  
**Status:** COMPLETE (local)

---

## PHASE 32 STATUS

| Item | Status |
|------|--------|
| **Phase 32** | **COMPLETE (local)** |
| **Production** | **UNTOUCHED** |
| **Staging** | **UNTOUCHED** |
| **APK** | **NOT BUILT** |
| **Local** | **IMPLEMENTED + TESTED** |

---

## 1. Summary

Phase 32 closes the **profile security boundary** gap identified in Phase 31:

- PocketBase `profiles.updateRule` no longer allows self direct mutation (local migration)
- Self-service updates routed through **`/api/profile/self`** with strict allowlist
- **Manager picker** on HR employee create/edit forms (API + audit)
- **Circular manager hierarchy** rejected server-side
- **Web sidebar** HR module uses capability bridge (`canAccessHrWebModule`)
- **Access Preview** expanded (account type, company scope, approval caps, sensitive flag)
- **RBAC matrix** documented in `lib/capabilities/web-access.ts`

---

## 2. Files Changed

### New files

| File | Purpose |
|------|---------|
| `lib/hr/profile-self-service.ts` | Allowlist + restricted field definitions |
| `lib/hr/profile-mutation-server.ts` | Server self-profile read/update/avatar |
| `lib/hr/manager-hierarchy.ts` | Manager candidates + circular detection |
| `lib/capabilities/web-access.ts` | Web nav bridge + RBAC matrix |
| `lib/profile-self-api.ts` | Web client for self-profile API |
| `mobile/lib/profile-self-api.ts` | Mobile client for self-profile API |
| `app/api/profile/self/route.ts` | GET/PATCH self profile |
| `app/api/profile/self/avatar/route.ts` | POST avatar upload/remove |
| `app/api/hr/employees/manager-candidates/route.ts` | Manager picker data |
| `components/hr/HrManagerPickerField.tsx` | Manager picker UI |
| `scripts/migrate-local-hr-phase32-profile-rules.mjs` | Local PB rule tightening |
| `scripts/test-phase32-rbac-hardening.mjs` | Phase 32 security tests |
| `docs/PHASE_32_RBAC_HARDENING_REPORT.md` | This document |

### Modified files

| File | Change |
|------|--------|
| `lib/hr/employee-mutation-server.ts` | Circular manager check, `access_changed` audit, richer Access Preview |
| `lib/hr/employee-onboarding-server.ts` | Circular manager on create |
| `lib/capabilities/index.ts` | Export web-access helpers |
| `components/EmployeeSelfProfile.tsx` | Use self-profile API (not direct PB) |
| `mobile/app/(tabs)/profile.tsx` | Use self-profile API |
| `components/hr/HrEmployeeOnboardForm.tsx` | Manager picker + API field |
| `app/(dashboard)/hr/employees/[id]/page.tsx` | Manager picker, sensitive UI gate |
| `app/(dashboard)/hr/employees/[id]/access-preview/page.tsx` | Expanded preview UI |
| `app/(dashboard)/hr/employees/page.tsx` | `canAccessEmployeeCreate` for add button |
| `components/Sidebar.tsx` | `canAccessHrWebModule` |
| `scripts/bootstrap-local-pb.mjs` | `profiles.updateRule` HR/Owner only |
| `package.json` | Phase 32 scripts |

---

## 3. Schema Changes

| Change | Production |
|--------|------------|
| None new fields | **NOT migrated** |

Phase 31 `profiles.manager` still applies via `migrate:local-hr-phase31` if not yet run.

---

## 4. PocketBase Rule Changes (LOCAL ONLY)

### `profiles.updateRule`

| Before | After |
|--------|-------|
| `user = @request.auth.id \|\| HR_OR_OWNER` | **HR_OR_OWNER only** |

**Rationale:** Self-service must not bypass server allowlist. Employees use `/api/profile/self` (admin PB on server).

**Apply locally:** `npm run migrate:local-hr-phase32`

`listRule` / `viewRule` unchanged — employees can still **read** own profile.

---

## 5. API Changes

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/profile/self` | Session | Safe self profile (no sensitive fields) |
| PATCH | `/api/profile/self` | Session | Allowlist: phone, address, date_of_birth, bio |
| POST | `/api/profile/self/avatar` | Session | Avatar upload/remove |
| GET | `/api/hr/employees/manager-candidates` | `employee.assign_manager` | Manager picker options |

Existing Phase 31 employee mutation APIs unchanged except circular manager validation.

---

## 6. RBAC Changes

No capability definition changes from Phase 31 — matrix confirmed:

| Capability | Owner | HR | Manager | Staff | Staff-basic | Security | OB |
|------------|:-----:|:--:|:-------:|:-----:|:-----------:|:--------:|:--:|
| employee.view | ✓ | ✓ | — | — | — | — | — |
| employee.create | ✓ | ✓ | — | — | — | — | — |
| employee.update | ✓ | ✓ | — | — | — | — | — |
| employee.activate | ✓ | — | — | — | — | — | — |
| employee.deactivate | ✓ | — | — | — | — | — | — |
| employee.view_sensitive | ✓ | ✓ | — | — | — | — | — |
| employee.manage_accounts | ✓ | ✓ | — | — | — | — | — |
| employee.manage_hr_accounts | ✓ | — | — | — | — | — | — |
| employee.assign_manager | ✓ | ✓ | — | — | — | — | — |
| employee.view_team | ✓ | ✓ | ✓ | — | — | — | — |

Source: `lib/capabilities/web-access.ts` → `EMPLOYEE_CAPABILITY_MATRIX`

---

## 7. Manager Hierarchy

- **UI:** `HrManagerPickerField` on onboard + employee detail
- **API:** `manager_user_id` via existing PATCH `/api/hr/employees/[id]`
- **Candidates:** owner, hr, manager (active), company-scoped, excludes self
- **Validation:** `assertNoCircularManagerAssignment()` walks manager chain (max depth 32)
- **Audit:** `employee.manager_changed` (metadata: before/after manager user ids only)

---

## 8. Access Preview Changes

Now includes:

- User: role, account_type, status, dashboard_access
- Manager name
- Company scope label + actor company ids
- Employee capabilities
- Mobile capabilities
- Approval capabilities (`leave.approve`, etc.)
- `sensitive_data_access` boolean
- Restricted list

Still **read-only** — no impersonation.

---

## 9. Profile Self-Service Allowlist

**Allowed (self via API):**

- `phone`, `address`, `date_of_birth`, `bio`, `avatar`

**Blocked (server rejects + PB rule blocks direct client):**

- NIK, NPWP, salary/compensation, manager, role fields, status, dashboard_access, shifts, office, etc.

---

## 10. Audit Events

| Event | Phase 32 status |
|-------|-----------------|
| employee.created | ✓ (Phase 31) |
| employee.updated | ✓ |
| employee.activated | ✓ |
| employee.deactivated | ✓ |
| employee.role_changed | ✓ |
| employee.access_changed | ✓ **NEW** (dashboard_access) |
| employee.manager_changed | ✓ (with circular guard) |
| employee.sensitive_data_changed | ✓ (field names only) |

---

## 11. Security Tests

| Suite | Result |
|-------|--------|
| `npm run test:phase32-rbac-hardening` | **35/35 PASS** |
| `npm run test:phase31-employee-rbac` | **32/32 PASS** |
| `npm run test:mobile-capabilities` | **227/227 PASS** |
| `npm run test:notification-unit` | **133/133 PASS** |
| `npm run test:hr-rating-unit` | **24/24 PASS** |
| `npm run test:hr-reporting-unit` | **5/5 PASS** |
| `npx tsc --noEmit` | **PASS** |

### Negative cases covered (Phase 32)

- Staff cannot activate / deactivate / change role / account_type / dashboard_access / manager
- Staff self-service cannot send restricted fields
- HR cannot `manage_hr_accounts` / activate
- Circular manager assignment rejected
- Audit metadata has no raw NIK/NPWP/password

---

## 12. Local Setup

```bash
node scripts/bootstrap-local-pb.mjs
npm run migrate:local-hr-phase31    # if manager field missing
npm run migrate:local-hr-phase32    # profile updateRule hardening
npm run test:phase32-rbac-hardening
```

---

## 13. Known Limitations

1. **`users.updateRule`** still allows HR to patch user fields on client — employee status/role changes should use APIs only (UI mostly migrated).
2. **Manager approval workflow** — managers in notification resolver (Phase 31) but leave API still HR-centric.
3. **Web route middleware** — still primarily `canAccess()` paths; capability bridge only on sidebar HR gate + employee buttons.
4. **`lib/profile.ts` `updateProfile()`** — legacy client helper still exists; HR flows should use employee API.
5. **Notification unit test** inline resolver may not reflect Phase 31 manager expansion in all assertions (regression suite still PASS).

---

## 14. Recommended Phase 33

1. **Staging rehearsal:** Phase 31 schema + Phase 32 profile rules
2. Tighten **`users.updateRule`** for privilege fields (server-only role/status)
3. **Manager-scoped leave approval** API + notifications
4. **Work schedule schema** (effective-dated shifts)
5. Middleware capability bridge for `/hr/employees/*` routes
6. Employee lifecycle notifications (created, activated)
7. Staging UAT → Owner approval before production

---

## STOP

Phase 32 local implementation complete. **No staging, production, or APK deployment.**
