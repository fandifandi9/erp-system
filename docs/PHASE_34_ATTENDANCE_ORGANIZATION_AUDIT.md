# Phase 34 — Attendance + Organizational Structure Alignment

**Date:** 2026-08-31  
**Mode:** AUDIT ONLY (LOCAL)  
**Scope:** Attendance engine, operational organization, legal entity separation, RBAC, desktop/mobile UI, APIs, PocketBase rules  
**Out of scope:** Staging, production, APK, schema migration, destructive changes

---

## FINAL GATE

# ⛔ BLOCKED — DESIGN DECISION REQUIRED

Audit selesai. Regression baseline lokal **PASS** (lihat §12). Namun ada **konflik arsitektur eksplisit** antara keputusan Owner Phase 34 dan implementasi saat ini yang **harus disetujui** sebelum Phase 34B dimulai.

**Tidak** menyatakan READY FOR STAGING.

Setelah Owner meninjau laporan ini dan menyetujui keputusan di §14, gate dapat berubah menjadi **READY FOR LOCAL IMPLEMENTATION (Phase 34B)**.

---

## Executive Summary

ERP sudah memiliki fondasi attendance server-side (`lib/hr/attendance-server.ts`), work schedule Phase 33B, dan capability system Phase 31–33. Namun:

1. **Desktop web check-in/out belum ada** — web staff diarahkan ke mobile saja (`NativeAttendanceOnlyNotice`), bertentangan dengan keputusan Owner: *Attendance WAJIB desktop + mobile dengan engine yang sama*.
2. **Bukan single engine** — tiga jalur logika paralel (server API, `lib/attendance.ts` legacy direct-write, `mobile/lib/attendance.ts` pre-validation duplikat).
3. **Legal entity vs operational org tercampur di lapisan scope** — `biz_user_companies` dipakai sebagai proxy “siapa karyawan PT mana”, sementara struktur operasional (`profiles.manager`, division/dept) tidak terikat PT dan bahkan belum konsisten di schema production.
4. **RBAC attendance belum capability-based** — enforcement masih role + company membership; manager tidak punya team attendance meskipun `employee.view_team` sudah ada.
5. **HR web attendance bypass API scoped** — UI query PocketBase langsung, berisiko cross-entity leak multi-PT.

Prinsip Owner **“PT = legal/administrative, bukan struktur operasional”** sebagian besar **belum tercermin** di data model dan UI, meskipun check-in **tidak** meminta pemilihan PT (sudah benar).

---

## 1. CURRENT STATE

### 1.1 Architecture — Attendance Write Path

```
Mobile UI (AttendanceCheckInPanel)
  → mobile/lib/attendance.ts          [client pre-validation, GPS, anti-cheat calc]
  → mobile/lib/hr-attendance-api.ts   [HTTP]
  → app/api/hr/attendance/*           [Next.js routes]
  → lib/hr/attendance-server.ts       [authoritative writes via admin PB]

Web staff check-in: TIDAK ADA
  → components/NativeAttendanceOnlyNotice.tsx
  → app/(dashboard)/dashboard-staff/attendance/* (stub)

Web HR monitoring:
  → app/(dashboard)/hr/attendance/page.tsx
  → Direct pb.collection("attendance_logs").getFullList()  [bypass scoped API]

Legacy (dead path, masih di repo):
  → lib/attendance.ts checkIn/checkOut → direct PB create
```

| Layer | File | Peran |
|-------|------|-------|
| Server engine | `lib/hr/attendance-server.ts` | Check-in/out, today, history, HR list (scoped), correction |
| Shared calc | `lib/attendance.ts` | Shift outcome, work hours (legacy local-time) |
| Work schedule | `lib/hr/work-schedule-resolve.ts`, `work-schedule-calc.ts`, `work-schedule-server.ts` | Phase 33B resolver + metrics |
| API | `app/api/hr/attendance/{check-in,check-out,today,history,route,[id]/correct}/route.ts` | |
| Mobile client | `mobile/lib/attendance.ts`, `mobile/lib/hr-attendance-api.ts` | |
| Mobile UI | `mobile/components/attendance/AttendanceCheckInPanel.tsx` | |
| Web staff | `NativeAttendanceOnlyNotice` | Mobile-only policy |
| Web HR | `app/(dashboard)/hr/attendance/page.tsx` | Monitoring + koreksi modal |
| Operational gate | `lib/operational-access-server.ts`, `lib/operational-access-gate.ts` | `web_access` on check-in/out |

### 1.2 API Surface (Attendance)

| Method | Route | Auth | Catatan |
|--------|-------|------|---------|
| POST | `/api/hr/attendance/check-in` | Session | Multipart selfie; rejects forged `user`, `company`, `status` |
| POST | `/api/hr/attendance/check-out` | Session | |
| GET | `/api/hr/attendance/today` | Session | Record + `schedule` + `metrics` (33B) |
| GET | `/api/hr/attendance/history` | Session | Own history |
| GET | `/api/hr/attendance` | HR/Owner | **Company-scoped** via `biz_user_companies` — **tidak dipakai HR UI** |
| POST | `/api/hr/attendance/[id]/correct` | HR/Owner | Audit `hr.attendance.corrected` |

**Tidak ada:** manager team attendance API, web desktop check-in consumer, recompute schedule API, persist OT/early-leave on check-out.

### 1.3 Work Schedule (Phase 33B) — Current

**Priority (sudah diimplementasi di server check-in):**

1. `hr_employee_work_schedules` → `hr_work_schedule_days`
2. Fallback `profiles.shift_start` / `shift_end` (+ weekend variants)
3. `source: "none"` → UI “Belum ditentukan”

**Split brain:**

- **Stored** `status` / `late_minutes` pada check-in: `computeCheckInShiftOutcome` (local time, `lib/attendance.ts`)
- **Ephemeral** `metrics.overtimeMinutes` / `earlyLeaveMinutes` pada `/today`: `work-schedule-calc.ts` (timezone-aware)
- Keduanya dapat **berbeda** untuk shift overnight / timezone non-default

**Schedule template** (`hr_work_schedules`) memiliki FK `company` (legal entity). **Assignment** melekat pada employee, bukan auto-per-PT.

### 1.4 Data Model — Legal Entity vs Operational

#### Legal entity (administrative / financial context)

| Artifact | Collection/Field | Purpose |
|----------|------------------|---------|
| Legal entity master | `biz_company_profile` | PT: name, code, legal_name |
| User ↔ PT membership | `biz_user_companies` | `user`, `company`, `is_active` — **authoritative HR company scope** |
| Work context pointer | `users.active_company`, `default_company` | UI/tenant switching (privilege field, server-only mutation) |
| Store/warehouse context | `users.active_store`, `active_warehouse`, etc. | Inventory/WMS context |
| Schedule template scope | `hr_work_schedules.company` | Template per PT |

**Tidak ada:** `profiles.company`, `attendance_logs.company`

Resolution: `lib/hr/company-scope.ts` — Owner → all active companies; non-owner → `biz_user_companies` only. **Tidak** fallback ke `active_company`. **Tidak** stamp profile company (deferred Wave 2+).

#### Operational organization

| Field | Location | Purpose |
|-------|----------|---------|
| `profiles.manager` | profiles | Direct manager (`relation → users`) — **bootstrap local; absent from `pb_migrations/`** |
| `profiles.position` | profiles | Job title (text + `hr_employee_options`) |
| `profiles.department` | profiles | Department label (text, global master) |
| `profiles.division` | profiles | Division label; leave quota grouping |
| `profiles.office_id` | profiles | Work location → `offices` (GPS fence) |
| `users.role_code` | users | HR security role |
| `users.hr_role_preset` | users | UI preset → role_code + inventory_role |
| `users.dashboard_access` | users | Web operational dashboard gate |
| `offices` | PB | GPS zones — **global, no company FK** |
| `division_quotas` | PB | Leave capacity by division string — **global, no company FK** |
| `hr_employee_options` | PB | Global position/dept/division dropdowns |

**Tidak ada:** team entity, operational scope collection, FK department/division tables.

#### `attendance_logs` schema (production snapshot)

Fields: `user`, `date`, `check_in`, `check_out`, `lat`, `lng`, `distance_meter`, `status`, `late_minutes`, `work_hours`, `is_suspicious`, `check_in_selfie` (+ local bootstrap may add `device_id`, `ip_address`).

**No** `company_id`, **no** OT/early-leave persisted fields.

Legacy parallel collection `attendance` (6 fields) still documented in production schema — potential confusion.

### 1.5 RBAC & Capabilities (Phase 31–33)

| Phase | Delivered | Attendance relevance |
|-------|-----------|---------------------|
| 31 | `lib/capabilities/employee.ts`, `employee-scope.ts` | `employee.view_team` + `MANAGED_EMPLOYEES` scope — **not wired to attendance** |
| 32 | `web-access.ts`, manager hierarchy, profiles PB lock | No attendance capability |
| 33A | User privilege hardening, `operational-access-server.ts` | `web_access` / `is_checked_in` sync on check-in/out — **not attendance RBAC** |
| 33B | `lib/capabilities/schedule.ts` | Manager can view team **schedules** only |

**Attendance capabilities today (mobile only):**

- `attendance.view`, `attendance.check_in`, `attendance.check_out` — granted to **all** authenticated roles (`mobile/lib/capabilities.ts`)
- **No** `lib/capabilities/attendance.ts` registry
- **No** scopes: OWN / MANAGED_EMPLOYEES / COMPANY for attendance
- Server: session auth + own-user for check-in/out; HR/Owner + company membership for list/correct

**Web path RBAC:** `lib/rbac.ts` — staff/manager get `/hr/reports` + `/dashboard-staff`; **no** `/hr/attendance` for manager; HR/Owner get `/hr/attendance`.

**Known bug:** `EmployeeDataScope.COMPANY` in `employee-scope.ts` returns `true` without `biz_user_companies` intersection (lines 79–80).

**Known bug:** `manager-candidates` route may pass `companyIds` where `userIds` expected (`app/api/hr/employees/manager-candidates/route.ts`).

### 1.6 PocketBase Rules (Company Scope)

**Company scope is server-only.** PB rules do **not** filter by company.

| Collection | Pattern | Manager read team? | Company in rule? |
|------------|---------|-------------------|------------------|
| `attendance_logs` | self OR hr/owner | **No** | **No** |
| `profiles` | self OR hr/owner | **No** (manager cannot read reports' profiles via PB) | **No** |
| `users` | view/list authed; update privilege-guarded | — | Blocks client `active_company` mutation |
| `biz_user_companies` | list/view authed; write superuser-only | — | Membership table |
| `leave_requests` | self OR hr/owner | **No** | **No** |

Local bootstrap: `attendance_logs` may still allow `createRule: user = @request.auth.id` — **direct client write risk** documented since Phase 12D.

### 1.7 UI — Desktop

| Audience | Attendance views | Check-in on web? | PT/company prominent? |
|----------|------------------|------------------|------------------------|
| **Staff** | `/dashboard-staff/attendance` → mobile notice only | **No** | N/A |
| **Manager** | None (no `/hr/attendance` in RBAC) | **No** | N/A |
| **HR** | `/hr/attendance` full monitoring, filters, koreksi, export | **No** (mobile only; HR bypasses `web_access`) | **No** company column/filter |
| **Owner** | Same as HR + KPI card | **No** | **No** |

**Operational web gate:** `web_access` required for non-exempt routes. Exempt: `/dashboard-staff/**`, `/profile/**`, `/hr/reports/**`. Owner/HR bypass.

Staff hub (`/dashboard-staff`) has cards for cuti/lembur/slip/luar kantor/laporan — **no attendance card** (pre-34B fix for reports added separately).

### 1.8 UI — Mobile

| Screen | Path | Features |
|--------|------|----------|
| Attendance tab | `mobile/app/(tabs)/attendance.tsx` | Today + history tabs; embedded leave/overtime/field segments |
| Check-in panel | `mobile/components/attendance/AttendanceCheckInPanel.tsx` | GPS, selfie, schedule card, office name, status, OT metrics from `/today` |
| History | `mobile/components/attendance/AttendanceHistoryPanel.tsx` | Own history via API |
| Operational gate | `mobile/components/OperationalGate.tsx` | Locks ops screens until check-in |

**No** company/PT on check-in UI — shows **office name** + GPS only (aligned with Owner UX intent).

**No** HR attendance monitoring on mobile — HR hub is approval queues only.

### 1.9 Employee Onboarding Gap

`serverCreateEmployeeByHr` creates `users` + `profiles` but **does not** create `biz_user_companies` row. New employees may be **invisible** to company-scoped HR attendance until manual membership backfill.

---

## 2. TARGET STATE (Owner Phase 34 Decision)

### 2.1 Attendance

- **Single attendance engine** shared by desktop web + mobile Android
- Both channels: check-in, check-out, today status, schedule, late, early leave, overtime, history, correction (RBAC), team view (manager scope), HR management
- **No PT selector** on check-in; legal entity **server-derived** from master data
- `attendance_logs` may store `company_id` (or equivalent) for audit/payroll — **never client-selected**

### 2.2 Organizational Model

```
Employee
├── Division          (operational)
├── Department        (operational)
├── Position          (operational)
├── Manager           (operational)
├── Work Schedule     (operational, per employee)
├── Operational Scope (capability + hierarchy)
└── Legal Entity      (administrative — PT for payroll, tax, contract)
```

Operational teams **may span** multiple legal entities. **No** duplicate dept/team per PT unless business explicitly wants it later.

### 2.3 RBAC

- **Capability + operational scope** (OWN / MANAGED_EMPLOYEES / COMPANY / CROSS_ENTITY where policy allows)
- Manager warehouse can see team attendance cross-PT if policy permits
- HR sees data per capability + organizational scope
- Legal/financial boundaries preserved where required

### 2.4 UI Targets

**Staff (minimal):** Schedule, status, check-in/out, late/OT indicators, history — **no PT as primary UI element**

**Manager:** My attendance + team attendance/status/late/absent/OT

**HR:** Employee attendance, review, correction, schedule management

**Owner:** Overview per capability/scope

**Desktop = Full ERP; Mobile = Operational + Approval + Notification** (unchanged)

---

## 3. GAP ANALYSIS

### 3.1 Critical Gaps

| ID | Gap | Current | Target | Severity |
|----|-----|---------|--------|----------|
| G1 | **Desktop web check-in/out** | Not implemented | Required | **Critical** |
| G2 | **Single attendance engine** | 3 parallel codepaths | One server + shared pure calc | **Critical** |
| G3 | **Manager team attendance** | No API/UI | Team view per operational scope | **High** |
| G4 | **HR UI bypasses scoped API** | Direct PB query | Use `GET /api/hr/attendance` | **High** |
| G5 | **COMPANY scope not enforced** | `employee-scope.ts` returns true | Membership intersection | **High** |
| G6 | **No `biz_user_companies` on employee create** | Onboarding gap | Auto-assign from actor scope | **High** |
| G7 | **Legal entity not on attendance record** | No stamp at write | Server-derived audit field | **Medium** |
| G8 | **OT / early leave not persisted** | Ephemeral on `/today` only | Persist or formal defer + document | **Medium** |
| G9 | **Check-in late calc vs metrics timezone split** | Two algorithms | Unified `work-schedule-calc` | **Medium** |
| G10 | **PB direct-write on attendance_logs** | Possible client create | Write-lock (superuser-only create) | **High** |
| G11 | **Anti-cheat dropped server-side** | `is_suspicious: false` hardcoded | Server computes or accepts validated signal | **Medium** |
| G12 | **`profiles.manager` schema parity** | Bootstrap only | Production migration | **High** |
| G13 | **No attendance capability module** | Mobile strings only | `lib/capabilities/attendance.ts` | **Medium** |

### 3.2 Aligned with Owner (No Gap)

| Item | Status |
|------|--------|
| No PT/company selector on check-in UI | ✅ |
| Server rejects client `company` / `company_id` on attendance body | ✅ |
| Work schedule per employee (not auto per PT) | ✅ Phase 33B |
| Phase 33B priority chain (assignment → legacy profile → none) | ✅ |
| Office/GPS-based check-in (not QR) | ✅ |
| Legal entity not shown as primary check-in UI element | ✅ (office name only) |

### 3.3 Partial / Inconsistent

| Item | Issue |
|------|-------|
| Manager scope | `MANAGED_EMPLOYEES` is cross-entity (hierarchy) but attendance list is company-locked HR-only — **policy undefined** |
| Work schedule `company` FK | Template scoped to PT but assignment is employee-scoped — acceptable if templates are administrative |
| `web_access` gate | Mobile check-in unlocks web ERP ops — desktop attendance would need explicit rule: does web check-in also set `web_access`? |
| Division/department | Free text, global masters — operational but not structured |

---

## 4. SECURITY RISK

| Risk | Description | Mitigation (Phase 34B) |
|------|-------------|------------------------|
| **S1** | HR web loads all `attendance_logs` via client PB — cross-PT leak for multi-company HR | Wire UI to scoped API; PB listRule company filter optional defense-in-depth |
| **S2** | `attendance_logs` client create may bypass server GPS validation | PB write-lock: create/update/delete = null (superuser) |
| **S3** | `COMPANY` employee scope not enforced | Fix `canActorAccessTargetUser` + membership check |
| **S4** | Legacy `lib/attendance.ts` direct write still callable | Deprecate/remove write path; document forbidden |
| **S5** | Anti-cheat only on client; server ignores | Move validation to server or signed client attestation |
| **S6** | New employees without `biz_user_companies` fall outside HR scope silently | Onboarding assigns membership |
| **S7** | Manager cannot read direct reports' profiles via PB — blocks future manager UI if using client PB | Manager views must use server APIs only |

**Existing security preserved (do not weaken):**

- Phase 33A `users.updateRule` privilege guards
- `rejectClientAttendanceForgeFields` on API bodies
- Session auth via `authRefresh` only
- Correction workflow with audit event

---

## 5. DATA MODEL GAP

| Gap | Recommendation (Phase 34B — after Owner approval) |
|-----|-----------------------------------------------------|
| No `attendance_logs.company_id` | Add optional `company_id` (relation → `biz_company_profile`), **server-stamped** from primary `biz_user_companies` or future `profiles.legal_entity_id` — never client |
| No `profiles.company` / legal entity on profile | **Decision required:** defer vs add `legal_entity_id` administrative field separate from operational org |
| `profiles.manager` missing in migrations | Add migration; verify production |
| `office_id` text vs relation mismatch | Normalize schema type |
| No team / operational_scope entity | Phase 34B may use `profiles.manager` chain first; formal team table later |
| Global `offices`, `division_quotas`, `hr_employee_options` | Document as shared operational masters; optional company dimension later |
| OT/early-leave not stored | Add fields or separate `attendance_metrics` — **decision required** for payroll integration |
| Legacy `attendance` collection | Document deprecated; do not delete yet |

---

## 6. UI/UX GAP

| Audience | Gap | Priority |
|----------|-----|----------|
| Staff desktop | No check-in/out, schedule, today status, history | **P0** (Owner mandate) |
| Staff desktop | `/dashboard-staff/attendance` is stub notice | P0 |
| Staff mobile | Largely complete | Maintain parity with desktop |
| Manager | No team attendance view (web or mobile) | P1 |
| HR | No company filter; bypasses scoped API | P1 |
| HR | No web work schedule CRUD (33B API exists) | P2 |
| HR mobile | No attendance monitoring queue | P2 |
| All | Correction UI basic (checkout/status only in modal) | P3 |

**UX aligned:** No PT on check-in; schedule card on mobile; simple staff-oriented copy.

---

## 7. API GAP

| API | Status | Gap |
|-----|--------|-----|
| POST check-in/out | ✅ | Needs desktop consumer; unify calc |
| GET today + metrics | ✅ | Persist metrics decision pending |
| GET history (own) | ✅ | |
| GET list (HR scoped) | ✅ implemented | **Not used by HR UI** |
| POST correct | ✅ | UI incomplete vs API capabilities |
| Manager team list | ❌ NOT IMPLEMENTED | |
| Desktop attendance dashboard aggregate | ❌ NOT IMPLEMENTED | |
| Recompute after schedule change | ❌ NOT IMPLEMENTED | |
| Local attendance test harness | ❌ | Only `test-hr-attendance-api-staging.mjs` |

---

## 8. RBAC GAP

| Capability needed | Exists? | Enforced server-side? |
|-------------------|---------|----------------------|
| `attendance.view_own` | Mobile only (as `attendance.view`) | Partial |
| `attendance.check_in` / `check_out` | Mobile only | Auth only, not capability assert |
| `attendance.view_team` | ❌ | ❌ |
| `attendance.manage` (HR) | Implicit HR role | Role-based |
| `attendance.correct` | Implicit HR/Owner | ✅ on correct route |
| `schedule.view` (team) | ✅ 33B | ✅ work-schedule-auth |

**Manager approval capabilities** (`leave.approve`, etc.) still HR/Owner only — notification recipients reference manager caps that mobile does not grant (pre-existing drift).

---

## 9. MIGRATION RISK

| Change | Risk | Mitigation |
|--------|------|------------|
| Add `attendance_logs.company_id` | Low if nullable + backfill script | Backfill from `biz_user_companies` primary membership |
| Add `profiles.manager` to production | Medium if field missing | Verify schema snapshot first |
| PB attendance write-lock | Medium — breaks direct client writes | Ensure all clients use API (mobile already does) |
| Desktop check-in launch | Low schema risk; UX/policy risk | Owner sign-off on `web_access` interaction |
| Remove `lib/attendance.ts` writes | Low if no consumers | Grep + test before delete |
| Deprecate `attendance` collection | Low | Read-only audit first |

**Do not:** delete legacy shift fields, `profiles.shift_*`, or `biz_user_companies` in Phase 34B without explicit approval.

---

## 10. BACKWARD COMPATIBILITY

| Layer | Strategy |
|-------|----------|
| Profile shift fields | Keep as fallback (33B decision) |
| `lib/attendance.ts` | Keep read helpers; gate/remove writes |
| Mobile client pre-validation | Keep until server parity proven; then thin client |
| HR direct PB reads | Replace with API gradually; feature-flag if needed |
| `web_access` operational gate | Unchanged for non-attendance modules unless Owner decides desktop check-in sets same flag |
| PocketBase rules | Additive migrations only locally in 34B |
| Multi-entity HR | Stricter scoping may **reduce** visible rows for HR users — document as fix not regression |

---

## 11. RECOMMENDED IMPLEMENTATION ORDER (Phase 34B — after approval)

1. **Owner design sign-off** (§14 decisions)
2. **Schema parity:** `profiles.manager` migration; optional `attendance_logs.company_id`; PB attendance write-lock (local)
3. **Single engine refactor:** Extract pure calc; server-only writes; deprecate `lib/attendance.ts` create path; thin mobile client
4. **Unify late/OT/early-leave** calculation with `work-schedule-calc` + timezone; decide persist strategy
5. **RBAC:** `lib/capabilities/attendance.ts` + scopes; fix `COMPANY` scope enforcement; wire manager team API
6. **Employee onboarding:** `biz_user_companies` on create
7. **HR UI:** Switch to scoped API; add company filter for multi-PT
8. **Desktop attendance UI:** Staff check-in/out + today + history (capability-gated)
9. **Manager UI:** Team attendance view (web; mobile optional)
10. **Server anti-cheat** + `is_suspicious` pipeline
11. **Local automated tests** + desktop UAT + mobile source audit (no APK)
12. **Documentation** + Phase 34B implementation report

---

## 12. REGRESSION BASELINE (2026-08-31)

| Suite | Result | Notes |
|-------|--------|-------|
| Phase 33A user privilege | **PASS** (42/42) | |
| Phase 33B work schedule | **PASS** (31/31) | |
| Phase 33B local verify | **PASS** (21/21) | |
| Phase 32 RBAC hardening | **PASS** (35/35) | |
| Phase 31 employee RBAC | **PASS** (32/32) | |
| Mobile capabilities | **PASS** (227/227) | |
| Notification unit | **PASS** (133/133) | |
| HR reporting unit | **PASS** (5/5) | |
| HR wave1 foundation | **PASS** (16/16) | Live cookie tests manual |
| HR wave2 leave | **PASS** (12/12) | Staging write-lock **BLOCKED** (no staging URL) |
| Operational access gate | **PASS** (7/7) | Local script (reports exempt) |
| TypeScript `tsc --noEmit` | **PASS** | |
| **Attendance API integration** | **BLOCKED** | Only `scripts/test-hr-attendance-api-staging.mjs` — requires staging |
| **Attendance dedicated local unit** | **NOT IMPLEMENTED** | No `test-phase34-attendance.mjs` yet |
| **Desktop attendance UI** | **NOT IMPLEMENTED** | By design today; conflict with Phase 34 target |
| **Manager team attendance** | **NOT IMPLEMENTED** | |
| **Physical Android UAT** | **NOT RUN** | Out of scope Phase 34 audit |

---

## 13. PHASE 33B FOUNDATION ASSESSMENT

Phase 33B is **suitable as schedule foundation** for Phase 34 with caveats:

| Area | Assessment |
|------|------------|
| Schema (`hr_work_schedules`, days, assignments) | ✅ Ready locally |
| Resolver priority chain | ✅ Matches Owner priority |
| Overnight / grace / OT calc (pure functions) | ✅ Ready; not fully wired to persisted check-in status |
| Mobile schedule card | ✅ |
| HR web schedule management UI | ❌ Not built (API only) |
| Schedule `company` FK on templates | ⚠️ Administrative scope — acceptable if templates are PT-specific but assignments are employee-based |

---

## 14. DESIGN DECISIONS REQUIRED (Owner Review)

Before Phase 34B, Owner must confirm:

### D1 — Desktop attendance scope
Owner mandates desktop + mobile. Confirm:
- Full check-in/out on web (GPS via browser geolocation)?
- Does web check-in set `web_access` same as mobile?
- Selfie on desktop required when HR mandates `require_checkin_selfie`?

### D2 — Manager cross-entity team attendance
When team members have different legal entities:
- **Option A:** Manager sees all direct reports (operational hierarchy wins)
- **Option B:** Manager sees only reports sharing at least one `biz_user_companies` with manager
- **Option C:** Configurable per capability/policy

Current code is **inconsistent** (hierarchy in employee-scope, company in attendance-server).

### D3 — Legal entity on attendance record
How to stamp `company_id` on `attendance_logs` at check-in:
- **Option A:** Primary active `biz_user_companies` row for employee
- **Option B:** New `profiles.legal_entity_id` (administrative field)
- **Option C:** No stamp; resolve at report time only

### D4 — OT / early leave persistence
- **Option A:** Add columns to `attendance_logs` on check-out
- **Option B:** Compute on read only (current `/today` behavior) — document payroll limitation
- **Option C:** Separate `attendance_daily_metrics` collection

### D5 — `profiles.manager` production migration
Confirm rollout to staging/production timeline (blocking manager team features).

### D6 — HR multi-PT visibility
After scoped API enforcement, HR user with single `biz_user_companies` membership will **only** see that PT's employees — confirm expected.

---

## 15. FILES AUDITED (Reference)

| Area | Key paths |
|------|-----------|
| Attendance server | `lib/hr/attendance-server.ts`, `lib/attendance.ts` |
| Work schedule | `lib/hr/work-schedule-*.ts`, `lib/capabilities/schedule.ts` |
| Company scope | `lib/hr/company-scope.ts` |
| Employee / org | `lib/hr/employee-onboarding-server.ts`, `lib/hr/employee-scope.ts`, `lib/hr/employee-profile-payload.ts` |
| RBAC | `lib/rbac.ts`, `lib/capabilities/employee.ts`, `lib/capabilities/mobile-resolve.ts` |
| Operational gate | `lib/operational-access-gate.ts`, `lib/hr/operational-access-server.ts` |
| APIs | `app/api/hr/attendance/**` |
| Desktop UI | `app/(dashboard)/hr/attendance/**`, `app/(dashboard)/dashboard-staff/attendance/**`, `components/NativeAttendanceOnlyNotice.tsx` |
| Mobile UI | `mobile/components/attendance/**`, `mobile/app/(tabs)/attendance.tsx` |
| PB schema | `scripts/bootstrap-local-pb.mjs`, `pb_migrations/*` |
| Prior reports | `docs/PHASE_33B_WORK_SCHEDULE_IMPLEMENTATION_REPORT.md`, `docs/PHASE_30_EMPLOYEE_RBAC_ALIGNMENT_AUDIT.md`, `docs/PHASE_12_PRE_IMPLEMENTATION_DECISIONS.md` |

---

## 16. CONCLUSION

Phase 34 audit menemukan fondasi yang **cukup untuk memulai implementasi lokal**, tetapi **tidak boleh** langsung implementasi besar tanpa keputusan Owner pada §14.

**Gate: BLOCKED — DESIGN DECISION REQUIRED**

Setelah Owner menyetujui D1–D6, gate berubah menjadi:

**READY FOR LOCAL IMPLEMENTATION (Phase 34B)**

Alur berikutnya (post-approval):

```
Phase 34B LOCAL IMPLEMENTATION
  → LOCAL AUTOMATED TEST
  → LOCAL DESKTOP UAT
  → LOCAL MOBILE UAT (source-level; no APK)
  → OWNER APPROVAL
  → STAGING UAT
  → PRODUCTION
```

---

*Audit performed locally only. No staging/production/APK changes. No commits requested.*
