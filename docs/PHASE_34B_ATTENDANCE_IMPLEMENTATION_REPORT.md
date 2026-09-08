# Phase 34B — Attendance + Flexible Organization (Local Implementation)

**Date:** 2026-08-31  
**Mode:** LOCAL ONLY  
**Status:** COMPLETE (automated verification)

---

## FINAL GATE

# ✅ READY FOR LOCAL DESKTOP UAT

**NOT** READY FOR STAGING · **NOT** READY FOR PRODUCTION · **NO APK**

---

## Owner Design Decisions Implemented

| Decision | Implementation |
|----------|----------------|
| **D1** Desktop + mobile, one engine | `lib/hr/attendance-engine.ts` + `attendance-server.ts`; desktop UI `DesktopAttendancePanel`; `client_channel: web\|mobile` |
| **D2** Manager team = hierarchy ∩ company | `listAllManagedEmployeeUserIds` + `listUserIdsInCompanies` in scoped list API |
| **D3** `company_id` server-only | `resolveAttendanceCompanyId()` in `employment-scope.ts`; forge rejection |
| **D4** Persist late/OT/early + snapshot | New PB fields + checkout finalization via engine |
| **D5** No production `profiles.manager` migration | Local bootstrap only; production untouched |
| **D6** HR scoped by membership | `GET /api/hr/attendance` filters by `company_id` / scope |

---

## Schema Changes (Local PB)

Collection `attendance_logs` — fields added:

| Field | Type | Purpose |
|-------|------|---------|
| `company_id` | relation → `biz_company_profile` | Legal entity stamp (server) |
| `early_leave_minutes` | number | Persisted metric |
| `overtime_minutes` | number | Persisted metric |
| `schedule_source` | text | Snapshot |
| `schedule_start` / `schedule_end` | text | Snapshot HH:mm |
| `schedule_timezone` | text | Snapshot TZ |
| `schedule_assignment_id` | text | Snapshot assignment |
| `late_grace_minutes` | number | Snapshot grace |
| `early_leave_grace_minutes` | number | Snapshot grace |
| `is_working_day` | bool | Snapshot |

**Migration command:**

```bash
npm run migrate:local-hr-phase34b
```

---

## Files Changed (Key)

| Area | Files |
|------|-------|
| Engine | `lib/hr/attendance-engine.ts` (new) |
| Employment | `lib/hr/employment-scope.ts` (new) |
| Capabilities | `lib/capabilities/attendance.ts`, `attendance-auth.ts`, `index.ts`, `mobile-resolve.ts` |
| Server | `lib/hr/attendance-server.ts`, `work-schedule-server.ts` |
| Scope | `lib/hr/employee-scope.ts` (COMPANY + transitive managed) |
| Manager | `lib/hr/manager-hierarchy.ts`, `manager-candidates/route.ts` |
| Onboarding | `lib/hr/employee-onboarding-server.ts` (`biz_user_companies`) |
| API | `app/api/hr/attendance/*`, `check-in/route.ts` |
| Desktop UI | `components/hr/DesktopAttendancePanel.tsx`, `dashboard-staff/attendance/**` |
| HR UI | `app/(dashboard)/hr/attendance/page.tsx` → scoped API |
| Staff hub | `dashboard-staff/page.tsx` attendance card |
| Migration | `scripts/migrate-local-hr-phase34b.mjs` |
| Tests | `scripts/test-phase34-attendance.mjs` |

---

## Architecture

```
Mobile / Desktop UI
       ↓
/api/hr/attendance/*  (capability auth)
       ↓
attendance-server.ts  (admin PB writes)
       ↓
attendance-engine.ts + work-schedule-calc.ts
       ↓
attendance_logs (+ company_id + snapshot + metrics)
```

---

## Capabilities

| Capability | Staff | Manager | HR | Owner |
|------------|-------|---------|-----|-------|
| `attendance.view_self` | ✓ | ✓ | ✓ | ✓ |
| `attendance.check_in/out` | ✓ | ✓ | ✓ | ✓ |
| `attendance.view_team` | | ✓ | ✓ | ✓ |
| `attendance.manage` | | | ✓ | ✓ |

Desktop check-in: selfie **optional** (`client_channel: web`). Mobile: selfie when HR policy requires.

---

## Test Results

| Suite | Result |
|-------|--------|
| Phase 34B attendance | **18/18 PASS** |
| Phase 33A | **42/42 PASS** |
| Phase 33B | **31/31 PASS** |
| Phase 32 | **35/35 PASS** |
| Phase 31 | **32/32 PASS** |
| TypeScript | **PASS** |

Run:

```bash
npm run migrate:local-hr-phase34b
npm run test:phase34-attendance
npm run test:phase33a-user-privilege
npm run test:phase33b-work-schedule
npm run test:phase32-rbac-hardening
npm run test:phase31-employee-rbac
npx tsc --noEmit
```

---

## Remaining Limitations

1. **Mobile client** (`mobile/lib/attendance.ts`) still contains legacy pre-validation — server is authoritative; full mobile thin-client refactor deferred.
2. **PB write-lock** on `attendance_logs` (block direct client create) not applied in 34B — recommend Phase 34C.
3. **Manager without `biz_user_companies`** rows gets empty team scope (fail closed).
4. **Multi-company employee** without `default_company`/`active_company` in membership → check-in blocked with clear HR message (by design D3).
5. **Production** schema unchanged (`profiles.manager`, attendance fields) per D5.
6. **Physical Android UAT** not run (no APK).
7. **Group HR** cross-company = union of actor's `biz_user_companies` rows (no separate grant table yet).

---

## Local Desktop UAT Checklist

- [ ] Staff: `/dashboard-staff/attendance` — check-in with browser GPS
- [ ] Staff: check-out shows late/OT if applicable
- [ ] Staff: `/dashboard-staff/attendance/history` lists own records
- [ ] HR: `/hr/attendance` loads via API (scoped to HR company)
- [ ] Manager: team list only direct/indirect reports in same company scope
- [ ] Multi-company employee without primary → blocked with HR message
- [ ] No PT selector on check-in UI
- [ ] Manager dropdown shows users in company scope (not Owner-only)
- [ ] New employee gets `biz_user_companies` row on create (HR actor company)
- [ ] Edit work schedule after check-in — historical record metrics unchanged (snapshot)

---

## Stop Condition Met

- No staging/production deploy
- No APK build
- Awaiting Owner local UAT approval before staging

---

*See also: `docs/PHASE_34_ATTENDANCE_ORGANIZATION_AUDIT.md`*
