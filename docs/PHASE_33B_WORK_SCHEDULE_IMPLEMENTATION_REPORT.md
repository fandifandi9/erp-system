# Phase 33B — Work Schedule & Shift Foundation

**Date:** 2026-08-31  
**Mode:** LOCAL IMPLEMENTATION ONLY  
**Status:** COMPLETE (local automated tests)

---

## FINAL GATE

# ✅ READY FOR LOCAL PHYSICAL UAT

Automated local tests PASS. **Not** READY FOR STAGING UAT until Owner completes physical Android UAT on LAN.

| Item | Status |
|------|--------|
| **Phase 33B implementation** | **COMPLETE (local)** |
| **Automated tests** | **31/31 Phase 33B + full regression PASS** |
| **Local verify script** | **20/20 PASS** |
| **Production** | **UNTOUCHED** |
| **Staging** | **UNTOUCHED** |
| **APK** | **NOT BUILT** |

---

## 1. Legacy Shift Compatibility Decision

### Existing (unchanged)

Profile fields remain in PocketBase and HR forms:

- `shift_start`, `shift_end`, weekend variants
- `late_tolerance`, `grace_minutes`

### Source of truth priority

1. **Active `hr_employee_work_schedules` assignment** for business date → `hr_work_schedule_days`
2. **Fallback:** `resolveProfileShiftForDate()` (legacy profile fields)
3. **No assignment:** `source: "none"` → UI shows **"Belum ditentukan"** (no invented schedule)

Legacy fields are **not deleted** and **not auto-migrated** to Work Schedule.

---

## 2. Existing Attendance Audit (before 33B)

| Area | Behavior |
|------|----------|
| Check-in/out API | `/api/hr/attendance/check-in`, `check-out` |
| Server logic | `lib/hr/attendance-server.ts` (admin PB) |
| Mobile | `mobile/lib/attendance.ts` → ERP API |
| Shift source (pre-33B) | `profiles.shift_*` via `resolveProfileShiftForDate` |
| Late status | `computeCheckInShiftOutcome` (present/late only) |
| Grace | `resolveLateToleranceMinutes` from profile |
| Timezone | Implicit browser/local `Date` |
| Overnight | **Not supported** in legacy |
| Overtime minutes | **Not calculated** (only `work_hours` duration) |
| `attendance_logs` | Unchanged schema |

---

## 3. Architecture

```
Employee
  → hr_employee_work_schedules (effective_from / effective_to)
    → hr_work_schedules (company, timezone, grace)
      → hr_work_schedule_days (weekday 0–6)
        → resolveEmployeeDaySchedule()
          → computeAttendanceMetrics() (pure)
            → attendance check-in/out + mobile today view
```

---

## 4. Schema (LOCAL)

| Collection | Purpose |
|------------|---------|
| `hr_work_schedules` | Schedule header (company, type, timezone, grace) |
| `hr_work_schedule_days` | Per-weekday start/end/break/off |
| `hr_employee_work_schedules` | User assignment + effective dating |

**Migration:** `npm run migrate:local-hr-phase33b` (idempotent, local-only guard)

### Key fields

**hr_work_schedules:** `company`, `name`, `code`, `schedule_type` (`fixed`|`shift`), `timezone`, `effective_from`, `effective_to`, `is_active`, `late_grace_minutes`, `early_leave_grace_minutes`

**hr_work_schedule_days:** `schedule`, `weekday` (0=Sun…6=Sat), `start_time`, `end_time`, `break_start`, `break_end`, `is_working_day`

**hr_employee_work_schedules:** `user`, `schedule`, `effective_from`, `effective_to`, `is_active`

---

## 5. Schedule / Shift Model

- **FIXED / SHIFT** types stored on schedule header (extensible string enum)
- Weekly pattern: 7 rows per schedule (or subset + defaults on create)
- **Overnight:** `end_time <= start_time` → end instant on **next calendar day** from business date
- **Business date:** attendance `date` field (`YYYY-MM-DD`) drives resolution
- **Off day:** `is_working_day=false` → metrics `off_day`, check-in still allowed (present, 0 late)

---

## 6. Effective Date & History

- Assignments are **append-only**; end via `PATCH /api/hr/work-schedules/assignments/[id]` (`is_active=false`, `effective_to`)
- Overlapping active assignments **rejected** server-side
- August attendance uses August assignment even if September assignment exists

---

## 7. Pure Calculation (`lib/hr/work-schedule-calc.ts`)

**Input:** scheduledStart/End, actualCheckIn/Out, timezone, grace minutes, isWorkingDay

**Output:** status, scheduledDurationMinutes, actualDurationMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes, isOvernight

**Timezone:** explicit offset map (`Asia/Jakarta` default = UTC+7); no server local TZ.

**Examples verified in tests:**

| Case | Result |
|------|--------|
| 08:00–17:00, in 08:07, grace 10 | present, late 0 |
| 08:00–17:00, in 08:15, grace 10 | late 5 |
| 08:00–17:00, out 17:30 | overtime 30 |
| 22:00–06:00, in 21:55, out 06:10 | overnight, OT 10 |

---

## 8. API (server-authoritative)

| Method | Route | Capability |
|--------|-------|------------|
| GET | `/api/hr/work-schedules` | `schedule.view` |
| POST | `/api/hr/work-schedules` | `schedule.create` |
| PATCH | `/api/hr/work-schedules/[id]` | `schedule.update` |
| GET/PATCH | `/api/hr/work-schedules/[id]/days` | view/update |
| POST | `/api/hr/work-schedules/assignments` | `schedule.assign` |
| PATCH | `/api/hr/work-schedules/assignments/[id]` | `schedule.assign` |
| GET | `/api/hr/work-schedules/employee/[userId]` | `schedule.view` + scope |
| GET | `/api/hr/attendance/today` | + `schedule`, `metrics` |

All mutations use **admin PocketBase** after auth + capability checks.

---

## 9. RBAC / Capabilities

`lib/capabilities/schedule.ts`:

| Capability | Owner | HR | Manager | Staff |
|------------|-------|-----|---------|-------|
| schedule.view | ✅ | ✅ | ✅ (team scope via API) | ✅ (own) |
| schedule.create | ✅ | ✅ | ❌ | ❌ |
| schedule.update | ✅ | ✅ | ❌ | ❌ |
| schedule.assign | ✅ | ✅ | ❌ | ❌ |
| schedule.manage | ✅ | ✅ | ❌ | ❌ |

Mobile: `schedule.view` wired in `mobile/lib/capabilities.ts` + `AttendanceCheckInPanel` via `hasCapability()`.

**Staff cannot:** create, assign, or modify schedules (API + PB rules HR/Owner only for schedule collections).

---

## 10. Audit Events

| Event | When |
|-------|------|
| `schedule.created` | New schedule |
| `schedule.updated` | Header or days changed |
| `schedule.assigned` | Employee assignment |
| `schedule.assignment_ended` | Assignment closed |

Metadata only — no passwords/tokens/secrets.

---

## 11. Attendance Integration

`lib/hr/attendance-server.ts` `serverCheckIn`:

1. `resolveEmployeeDaySchedule()` for today
2. Work schedule off-day → present, 0 late
3. Else use schedule start + grace OR legacy profile fallback
4. Existing attendance API contract unchanged

`GET /api/hr/attendance/today` returns `{ data, schedule, metrics }` for mobile.

---

## 12. Mobile UI

`mobile/components/attendance/AttendanceCheckInPanel.tsx`:

- Schedule card (when `schedule.view`)
- Shows `08:00 — 17:00` or **Belum ditentukan** / **Hari libur**
- Actual check-in/out times
- Status + overtime minutes when available
- Existing sticky footer / check-in buttons preserved

---

## 13. Tests

| Suite | Result |
|-------|--------|
| `npm run test:phase33b-work-schedule` | **31/31 PASS** |
| `npm run verify:phase33b-local` | **20/20 PASS** |
| Phase 33A | 37/37 |
| Phase 32 | 35/35 |
| Phase 31 | 32/32 |
| Mobile capabilities | 227/227 |
| Notification | 133/133 |
| Rating | 24/24 |
| Reporting | 5/5 |
| Leave | 12/12 |
| TypeScript | PASS |

---

## 14. Files Added / Changed

### New

- `lib/hr/work-schedule-types.ts`
- `lib/hr/work-schedule-calc.ts`
- `lib/hr/work-schedule-resolve.ts`
- `lib/hr/work-schedule-auth.ts`
- `lib/hr/work-schedule-server.ts`
- `lib/hr/work-schedule-audit.ts`
- `lib/capabilities/schedule.ts`
- `app/api/hr/work-schedules/**`
- `scripts/migrate-local-hr-phase33b.mjs`
- `scripts/test-phase33b-work-schedule.mjs`
- `scripts/verify-phase33b-local.mjs`

### Modified

- `lib/hr/attendance-server.ts` — schedule-aware check-in
- `app/api/hr/attendance/today/route.ts` — schedule + metrics
- `mobile/components/attendance/AttendanceCheckInPanel.tsx`
- `mobile/lib/hr-attendance-api.ts`
- `mobile/lib/capabilities.ts`, `lib/capabilities/mobile-resolve.ts`, `index.ts`
- `mobile/lib/i18n.tsx`
- `scripts/test-mobile-capabilities.mjs`
- `package.json`

---

## 15. Known Limitations

1. **No HR web UI** for schedule management yet (API-only foundation)
2. **Timezone map** is explicit offset table (not full IANA/DST) — sufficient for Indonesia zones in Phase 33B
3. **Physical Android UAT** not run in this session — required before Staging
4. **Profile legacy** still used when no Work Schedule assignment
5. **Payroll / OT approval** not implemented
6. **Holiday calendar** not integrated

---

## 16. Recommendation — Phase 34

1. Owner **physical Android UAT** on LAN (`EXPO_PUBLIC_ERP_WEB_URL`, `EXPO_PUBLIC_POCKETBASE_URL`)
2. HR web UI for schedule CRUD + assignment
3. Staging migration + UAT
4. Optional: migrate profile shifts → work schedules (data tool, not automatic)
5. Holiday calendar + leave interaction
6. OT approval workflow

---

## Commands

```bash
npm run migrate:local-hr-phase33b
npm run test:phase33b-work-schedule
npm run verify:phase33b-local
npx tsc --noEmit
```

**STOP** — await Owner local physical UAT before Staging.
