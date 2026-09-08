# Phase 31 — Employee RBAC & Account Lifecycle Foundation

**Date:** 2026-08-31  
**Mode:** LOCAL IMPLEMENTATION ONLY  
**Status:** COMPLETE (local)

---

## PHASE 31 STATUS

| Item | Status |
|------|--------|
| **Phase 31** | **COMPLETE (local)** |
| **Production** | **UNTOUCHED** |
| **Staging** | **UNTOUCHED** |
| **Local** | **IMPLEMENTED + TESTED** |
| **Schema** | **Migration script ready** (`migrate-local-hr-phase31.mjs`) — not run on prod/staging |
| **APK** | **NOT BUILT** |
| **Tests** | **PASS** (see below) |

---

## 1. Architecture Decisions

### 1.1 Account governance (locked)

| Actor | Can create employee | Can activate | Can manage HR accounts | Notes |
|-------|---------------------|--------------|------------------------|-------|
| **Owner** | ✓ | ✓ | ✓ | All `employee.*` capabilities |
| **HR** | ✓ (non-HR targets) | ✗ | ✗ | `employee.create` blocked for HR preset without `employee.manage_hr_accounts` |
| **Manager** | ✗ | ✗ | ✗ | `employee.view_team` only |
| **Staff** | ✗ | ✗ | ✗ | No employee management caps |
| **Self** | ✗ | ✗ | ✗ | `assertNotSelfTarget` on mutations |

**No new role** (e.g. `hr-head`). Privileged HR account management remains **Owner-only** via `employee.manage_hr_accounts`. Future “Atasan HR” can be modeled as **organizational hierarchy + capability grant** without a new role code.

### 1.2 Authorization layers (unchanged principle)

```
UI (capability visibility)
  ↓
HR API routes (assertEmployeeCapability + scope)
  ↓
Admin PocketBase (server-only mutations)
  ↓
biz_activity_events (audit metadata)
```

UI hiding is **not** security. PocketBase client direct mutation for sensitive employee writes should be migrated away over time; Phase 31 routes HR detail **save** and **activate/deactivate** through APIs.

### 1.3 Mobile product rule (documented)

| Surface | Scope |
|---------|--------|
| **Desktop** | Full ERP — configuration, master data, payroll, system admin |
| **Mobile** | Operational + approval + notification — capability-driven nav |

HR on mobile: attendance like all employees + HR queues/review per capability.

### 1.4 Sensitive data

Fields gated by `employee.view_sensitive` on API responses and PATCH payloads:

- `nik`, `npwp`, `salary`, compensation overrides, deduction rates

Managers and staff never receive these via server PATCH unless capability present.

### 1.5 Manager hierarchy

- **Field:** `profiles.manager` → `users` (nullable, additive)
- **Scope:** `MANAGED_EMPLOYEES` resolver foundation in `lib/hr/employee-scope.ts`
- **UI:** Manager picker not yet on employee form (Phase 32)

### 1.6 Access Preview

- Read-only page + API — **no impersonation**
- Route: `/hr/employees/[id]/access-preview`
- API: `GET /api/hr/employees/[id]/access-preview`

---

## 2. Files Changed

### New files

| File | Purpose |
|------|---------|
| `lib/capabilities/employee.ts` | Employee capability registry + resolver |
| `lib/capabilities/index.ts` | Re-exports |
| `lib/capabilities/mobile-resolve.ts` | Server-side mobile cap resolver (Access Preview) |
| `lib/hr/employee-auth.ts` | API capability enforcement |
| `lib/hr/employee-scope.ts` | OWN / MANAGED / COMPANY scope |
| `lib/hr/employee-audit.ts` | Lifecycle audit events |
| `lib/hr/employee-mutation-server.ts` | Update, activate, deactivate, access preview |
| `app/api/hr/employees/[id]/route.ts` | PATCH employee |
| `app/api/hr/employees/[id]/activate/route.ts` | POST activate |
| `app/api/hr/employees/[id]/deactivate/route.ts` | POST deactivate |
| `app/api/hr/employees/[id]/access-preview/route.ts` | GET access preview |
| `app/(dashboard)/hr/employees/[id]/access-preview/page.tsx` | Access Preview UI |
| `scripts/migrate-local-hr-phase31.mjs` | Local schema: `profiles.manager` |
| `scripts/test-phase31-employee-rbac.mjs` | Phase 31 regression + security tests |
| `docs/PHASE_31_EMPLOYEE_RBAC_IMPLEMENTATION_REPORT.md` | This document |

### Modified files

| File | Change |
|------|--------|
| `lib/hr/employee-onboarding-server.ts` | Capability checks, audit on create, manager field |
| `lib/hr/hr-api-client.ts` | PATCH, activate, deactivate, access preview client |
| `app/api/hr/employees/route.ts` | `employee.create` capability gate |
| `app/(dashboard)/hr/employees/page.tsx` | API activate/deactivate, capability-gated toggle |
| `app/(dashboard)/hr/employees/[id]/page.tsx` | Page guard, API save, Access Preview link |
| `app/(dashboard)/hr/employees/incomplete/page.tsx` | HR page guard |
| `lib/notifications/recipients.ts` | Manager included for approval caps; lifecycle cap codes |
| `mobile/lib/capabilities.ts` | `employee.view_team`; manager resolver |
| `mobile/lib/hr-native-access.ts` | Capability-driven HR module access |
| `mobile/lib/work-dashboard-menu.ts` | Tiles filtered by `hasCapability()` |
| `mobile/app/(tabs)/_layout.tsx` | Tab visibility via capabilities |
| `scripts/bootstrap-local-pb.mjs` | `profiles.manager` on fresh bootstrap |
| `package.json` | `test:phase31-employee-rbac`, `migrate:local-hr-phase31` |

---

## 3. Schema Changes

| Collection | Field | Type | Production |
|------------|-------|------|------------|
| `profiles` | `manager` | relation → `users`, nullable | **NOT migrated** |

**Local apply:** `npm run migrate:local-hr-phase31` (idempotent, LOCAL ONLY)

---

## 4. API Changes

| Method | Route | Capability | Audit event |
|--------|-------|------------|-------------|
| POST | `/api/hr/employees` | `employee.create` / `manage_hr_accounts` | `employee.created` |
| PATCH | `/api/hr/employees/[id]` | `employee.update` | `employee.updated`, optional `sensitive_data_changed`, `manager_changed`, `role_changed` |
| POST | `/api/hr/employees/[id]/activate` | `employee.activate` | `employee.activated` |
| POST | `/api/hr/employees/[id]/deactivate` | `employee.deactivate` | `employee.deactivated` |
| GET | `/api/hr/employees/[id]/access-preview` | `employee.view` | — (read-only) |

All mutation routes call `rejectClientPrivilegeFields()` — client cannot send `role_code`, `account_type`, etc.

---

## 5. Capability Changes

### Employee capabilities (new — `lib/capabilities/employee.ts`)

| Capability | Owner | HR | Manager | Staff |
|------------|-------|-----|---------|-------|
| `employee.view` | ✓ | ✓ | — | — |
| `employee.create` | ✓ | ✓ | — | — |
| `employee.update` | ✓ | ✓ | — | — |
| `employee.activate` | ✓ | — | — | — |
| `employee.deactivate` | ✓ | — | — | — |
| `employee.view_sensitive` | ✓ | ✓ | — | — |
| `employee.manage_accounts` | ✓ | ✓ | — | — |
| `employee.manage_hr_accounts` | ✓ | — | — | — |
| `employee.assign_manager` | ✓ | ✓ | — | — |
| `employee.view_team` | ✓ | ✓ | ✓ | — |

### Mobile (extended)

| Capability | Added for |
|------------|-----------|
| `employee.view_team` | Owner, HR, Manager |

---

## 6. RBAC Matrix (summary)

See Phase 30 gap matrix; Phase 31 closes:

- Employee create → capability + audit ✓
- Employee activate → Owner API only ✓
- Sensitive data → API gating ✓
- Mobile nav → `hasCapability()` ✓
- Manager field → schema foundation ✓
- Access Preview → read-only foundation ✓
- Audit lifecycle → `biz_activity_events` ✓

**Still path-based:** Web sidebar (`lib/rbac.ts`) — deferred to Phase 32.

---

## 7. Audit Design

Events emitted via `emitEmployeeAuditEvent()` → `biz_activity_events`:

| Event code | When | Payload (safe) |
|------------|------|----------------|
| `employee.created` | HR/Owner create | target ids, role, status inactive |
| `employee.updated` | Profile PATCH | target ids |
| `employee.activated` | Status → active | before/after status |
| `employee.deactivated` | Status → inactive | before/after status |
| `employee.role_changed` | Preset change | before/after role_code |
| `employee.manager_changed` | Manager assign | before/after manager id |
| `employee.sensitive_data_changed` | Sensitive fields | **field names only** |
| `employee.access_changed` | Reserved | — |

Passwords, tokens, NIK/NPWP values are **never** stored in audit payload.

---

## 8. Access Preview Design

```
GET /api/hr/employees/:userId/access-preview
  → assert employee.view
  → resolve target user + profile
  → resolveEmployeeCapabilities(target)
  → resolveMobileCapabilitiesServer(target)
  → return JSON matrix (read-only)
```

UI shows: employee summary, mobile access checklist, employee capabilities, restricted list.

**Explicitly excluded:** login-as-user, impersonation, permission mutation.

---

## 9. Attendance Roadmap (foundation — not implemented)

Target model for Phase 32+:

```
Employee
  → WorkSchedule (effective_date, history)
    → DailyShift / ShiftTemplate (08:00–17:00, 09:00–18:00, …)
      → CheckIn / CheckOut (attendance_logs)
        → AttendanceCalculation (rules engine)
```

Current state: per-profile `shift_start` / `shift_end` fields remain. No `work_schedules` collection yet.

**Phase 31 deliverable:** Document only; schema design in Phase 32 attendance workstream.

---

## 10. Notification Implications

`lib/notifications/recipients.ts` updated:

- `leave.approve`, `overtime.approve`, `field_activity.approve` → **HR + Owner + Manager** (active users)
- Lifecycle event codes registered for future dispatch (`employee.created`, etc.)

**Not yet implemented:** Dispatch on employee lifecycle events (Phase 32).

**Future:** Manager-scoped recipients via `profiles.manager` + requester relation when leave API adds manager approval path.

---

## 11. Tests

| Suite | Command | Result |
|-------|---------|--------|
| Phase 31 RBAC + security | `npm run test:phase31-employee-rbac` | **32/32 PASS** |
| Mobile capabilities (regression) | `npm run test:mobile-capabilities` | **227/227 PASS** |
| TypeScript | `npx tsc --noEmit` | **PASS** (exit 0) |

### Security tests covered (negative)

- Staff cannot `employee.activate`, `employee.create`, `employee.view_sensitive`
- HR cannot `employee.manage_hr_accounts`, `employee.activate`
- HR cannot manage HR target without `manage_hr_accounts`
- Fail-closed: null user → empty capabilities
- Sensitive audit: field names only, no values

---

## 12. Known Limitations

1. **PocketBase `profiles.updateRule`** still allows broad self-update locally — tighten in Phase 32 after self-service API.
2. **Manager UI** — field exists in API/schema; employee detail form has no manager picker yet.
3. **`biz_user_companies`** — not auto-linked on employee create.
4. **Web navigation** — still `canAccess()` path-based; employee caps not wired to sidebar.
5. **Manager approval workflow** — notifications include managers but leave API still HR-centric.
6. **Lifecycle states** — still `active`/`inactive` only (no PENDING/SUSPENDED enum).
7. **`test-mobile-capabilities.mjs` inline resolver** — does not yet assert `employee.view_team` (covered by Phase 31 test script).

---

## 13. Security Findings (post-implementation)

| Risk | Status |
|------|--------|
| HR detail page unguarded | **Mitigated** — redirect if not HR/Owner |
| Direct PB profile save from HR UI | **Mitigated** — save via PATCH API |
| Owner-only activation bypass via PB client | **Partial** — UI uses API; PB rules unchanged |
| HR creates HR account | **Mitigated** — requires `manage_hr_accounts` (Owner) |
| Self-elevation via API body | **Mitigated** — `rejectClientPrivilegeFields` |
| Sensitive data in audit | **Mitigated** — metadata field names only |

---

## 14. Local Setup

```bash
# 1. Start local PocketBase
node scripts/bootstrap-local-pb.mjs

# 2. Apply Phase 31 schema (manager field)
npm run migrate:local-hr-phase31

# 3. Run tests
npm run test:phase31-employee-rbac
npm run test:mobile-capabilities
npx tsc --noEmit
```

---

## 15. Recommended Phase 32

1. **Staging schema:** `profiles.manager` + verification script
2. **Manager picker** on employee create/edit UI
3. **Tighten PB `profiles.updateRule`** + employee self-service allowlist API
4. **Manager-scoped leave approval** + notification routing by `MANAGED_EMPLOYEES`
5. **Work schedule schema** (effective-dated shifts)
6. **Employee lifecycle notifications** (created, activated)
7. **Web capability bridge** for sidebar (optional)
8. **Staging UAT** → Production gated rollout (no APK until mobile UAT)

---

## STOP

Phase 31 local implementation complete. **No staging, production, or APK deployment.**
