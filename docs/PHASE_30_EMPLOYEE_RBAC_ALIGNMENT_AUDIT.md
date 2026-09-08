# Phase 30 — Employee Lifecycle, RBAC & Access Architecture Alignment Audit

**Date:** 2026-08-31  
**Mode:** AUDIT ONLY — READ-ONLY  
**Author:** Senior architecture / security review (automated codebase inspection)

---

## PHASE 30 STATUS

| Item | Status |
|------|--------|
| **Phase 30** | **AUDIT COMPLETE** |
| **Production** | **UNTOUCHED** |
| **Staging** | **UNTOUCHED** |
| **Local** | **READ-ONLY AUDIT** |
| **Schema** | **UNCHANGED** |
| **APK** | **NOT BUILT** |
| **Code** | **NO CHANGES** (this document only) |
| **Tests** | **NO CHANGES** |

---

## A. Current Architecture Summary

### A.1 Identity model (single system — no duplicate employee identity)

The ERP uses **PocketBase `users`** as the authentication identity and **`profiles`** as the HR/employee record (1:1 via `profiles.user` relation). There is no separate candidate/recruitment collection.

| Layer | Collection / module | Responsibility |
|-------|---------------------|----------------|
| Auth identity | `users` | email, password, `status`, `role_code`, `account_type`, `dashboard_access`, `inventory_role`, `hr_role_preset`, session fields |
| Employee HR record | `profiles` | position, division, salary, shifts, NIK/NPWP, office, leave quota, compensation overrides |
| Work context | `users` relations | `active_company`, `default_company`, stores/warehouses (bootstrap) |
| Company membership | `biz_user_companies` | Multi-tenant scope for HR API (Phase 23+) |

**Canonical auth normalization:** `lib/auth-model.ts` — `account_type` (`owner` \| `user`) + `role_code` (`hr`, `manager`, `staff`, `staff-basic`, `security`, `ob`).

**Display presets (not security roles):** `lib/hr/employee-role-presets.ts` maps UI presets (e.g. `warehouse_staff`, `accounting`) → `role_code` + `inventory_role` + default `dashboard_access`.

### A.2 Authorization planes (parallel — not unified)

```
┌─────────────────────────────────────────────────────────────────┐
│ WEB DESKTOP                                                      │
│  middleware.ts → canAccess(path) → lib/rbac.ts (path prefixes)  │
│  Sidebar.tsx → canAccess + inventory/catalog helpers             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ WEB / MOBILE API                                                 │
│  lib/hr/api-auth.ts → PB authRefresh → isOwner / isHr           │
│  + companyIds via lib/hr/company-scope.ts                        │
│  Pattern: requireOwnerOrHrApiUser OR getAuthenticatedHrUser      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ MOBILE UI (Phase 24A — defined but largely unwired)              │
│  mobile/lib/capabilities.ts → 41 MobileCapability strings        │
│  resolveMobileCapabilities() — NOT used by tab/nav yet           │
│  Actual nav: mobile/lib/rbac.ts (duplicate) + path checks         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ POCKETBASE RULES (collection-level — production preserved)       │
│  users, profiles, leave_requests (write-locked), attendance_logs │
└─────────────────────────────────────────────────────────────────┘
```

**Third axis:** `inventory_role` (`none` \| `staff` \| `supervisor` \| `admin`) via `lib/inventory/access.ts` — independent of `role_code`.

### A.3 Employee lifecycle (as implemented today)

Target lifecycle in Phase 30 brief is **not fully implemented**. Current practical flow:

```
HR/Owner POST /api/hr/employees
        ↓
users.status = "inactive"  (cannot login)
profiles created (profile_status often "complete" if office filled)
        ↓
Owner toggles users.status → "active"  (UI: employees list only)
        ↓
Login → middleware canAccess + operational gates
        ↓
RBAC path / API auth / PB rules
```

**Missing conceptual states:** `PENDING`, `SUSPENDED`, `REJECTED`, `HR_SCREENING`, `APPROVED` as distinct fields/workflows. Only **`active` / `inactive`** on `users.status`.

**Legacy path:** `lib/profile.ts` `ensureProfile()` auto-creates `profile_status=incomplete` on first login — coexists with HR onboarding.

**No manager/reporting hierarchy field** on `profiles` or `users` — `MANAGED_EMPLOYEES` scope cannot be implemented without schema + resolver work.

### A.4 Recent alignment (local working tree — not Phase 30 implementation)

Recent local work (pre–Phase 30 audit) moved recruitment toward HR-controlled onboarding:

- `POST /api/hr/employees` — admin PB create, inactive by default
- `components/hr/HrEmployeeOnboardForm.tsx` — HR + Owner access
- Activation remains **Owner-only in UI** (`employees/page.tsx`)

This is **partial** alignment with Phase 30 account-creation policy; audit treats it as current state, not Phase 30 deliverable.

### A.5 Notifications (Phase 24)

- Dispatch: `lib/notifications/dispatch.ts`
- Recipients: `lib/notifications/recipients.ts` — maps capabilities → **HR OR Owner** filter (not full capability registry)
- Manager role **not** in approval recipient resolution today
- No notifications for employee create / activate / role change

### A.6 Audit trail (partial)

- `emitBusinessEventServer` → `biz_activity_events` (`lib/tenant/activity-server.ts`)
- Covered: leave, attendance correction, rating, reporting/findings (domain-specific)
- **Not covered:** employee create, profile HR edits, status toggle, role changes
- `sys_audit_log` collection referenced in bootstrap — **not wired** to employee lifecycle

---

## B. Target Architecture Summary

```
ROLE → CAPABILITY → DATA SCOPE → ACTION → AUDIT
```

| Layer | Question | Target |
|-------|----------|--------|
| Role | Who is this user? | `account_type` + `role_code` + `inventory_role` (preserved) |
| Capability | What may they do? | Named capabilities (extend Phase 24A); web registry mirror |
| Scope | On which data? | OWN, MANAGED_EMPLOYEES, COMPANY, HR_SCOPE |
| Action | Which operation? | API + PB rules per action |
| Audit | Who changed what? | Metadata events; no sensitive value duplication |

**Account policy:** HR creates employees (inactive); Owner activates; no self-elevation; privileged changes Owner-gated.

**Access Preview:** Read-only HR UI showing resolved capabilities + scope before activation — **not implemented**.

**Mobile:** Capability-driven navigation; not desktop clone; Android APK distribution unchanged.

---

## 1. Existing User / Account Architecture

| Field | Location | Used for |
|-------|----------|----------|
| `email`, `password` | `users` | Login |
| `status` | `users` | `active` \| `inactive` — login block when inactive |
| `account_type` | `users` | `owner` \| `user` |
| `role_code` | `users` | Primary RBAC code |
| `role` | `users` | Legacy mirror |
| `dashboard_access` | `users` | Staff web dashboard + mobile operational section |
| `inventory_role` | `users` | WMS/inventory |
| `hr_role_preset` | `users` | HR UI preset id |
| `web_access` | `users` | Operational web gate (check-in sync) |
| `session_nonce`, `mobile_session_nonce` | `users` | Multi-device session (Phase 17) |
| `is_checked_in`, `shift_active`, `last_checkin/out` | `users` | Attendance operational flags |

**Files:** `lib/auth-model.ts`, `scripts/bootstrap-local-pb.mjs`, `scripts/migrate-local-hr-employee-write.mjs`, `docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json` (users rules).

**Privilege escalation prevention:** `rejectClientPrivilegeFields()` blocks client-sent `role`, `role_code`, `account_type` on HR API bodies. **No server check** preventing HR API from creating `role_code=hr` for arbitrary users (by design today). **No block** on client PB `users.update` if rules allow HR to patch `status` (production rules may allow — see §12).

---

## 2. Existing Employee / Profile Architecture

| Category | Fields (`profiles`) |
|----------|---------------------|
| Basic | `name`, `email`, `position`, `department`, `division`, `office_id`, `employee_code`, `phone`, `address`, `join_date` |
| HR operational | shifts (weekday/Sat/Sun), `late_tolerance`, `leave_bookings_quota`, `require_checkin_selfie` |
| Sensitive identity | `nik`, `npwp` |
| Compensation | `salary`, `leave_daily_rate`, `extra_bonus_*`, `late_deduction_*`, `absence_deduction_*` |
| Lifecycle | `profile_status` (`incomplete` \| `complete` \| `draft` \| `active`) |

**Completion logic:** `lib/profile.ts` — `position` + `department` + `salary` → complete (differs from detail page rule where only office is required on save).

**Pages:**

| Route | Access guard | Mutations |
|-------|--------------|-----------|
| `/hr/employees` | HR + Owner | Owner: status toggle |
| `/hr/employees/new` | HR + Owner | API create |
| `/hr/employees/[id]` | **No page guard** | Client PB profile/user update |
| `/hr/employees/incomplete` | **No page guard** | List incomplete profiles |

**Self-service profile:** Employee UI edits subset; PB `profiles.updateRule` may allow self-update of **all** fields including salary/NIK (§12 risk).

---

## 3. Existing Role Architecture

### 3.1 Known roles (`role_code`)

| role_code | Web paths (summary) | Mobile capabilities (summary) |
|-----------|----------------------|-------------------------------|
| `owner` | `*` all paths | All HR caps + inventory admin |
| `hr` | Full HR module + staff paths | HR queues, findings, rating.manage |
| `manager` | `/dashboard-staff` + default user | Same as staff unless extended |
| `staff` | `/dashboard-staff` + default user | Standard operational caps |
| `staff-basic` | `/dashboard-staff` + default user | Reduced (no dashboard_access default) |
| `security` | `/profile`, `/aktivitas` | Attendance + profile |
| `ob` | `/profile`, `/aktivitas` | Attendance + profile |

**Presets** add warehouse/accounting variants without new `role_code` values.

### 3.2 Role vs position vs division vs manager

| Concept | Stored? | Notes |
|---------|---------|-------|
| Role (security) | ✅ `users.role_code` | |
| Position | ✅ `profiles.position` | Text + `hr_employee_options` |
| Division | ✅ `profiles.division` | Text + `hr_employee_options` |
| Manager | ❌ **Not modeled** | No `manager_id` / reporting_to |

---

## 4. Existing Capability Architecture (Phase 24A)

**Source:** `mobile/lib/capabilities.ts` — **41** capabilities (`MOBILE_CAPABILITIES`).

**Helpers:** `resolveMobileCapabilities()`, `hasCapability()`, `hasAllCapabilities()`, `hasAnyCapability()`, `listCapabilities()`.

**Categories present:** attendance, leave, overtime, field_activity, report, finding, rating, hr.queue, inventory, wms, payroll (own), profile, dashboard.

**Gaps vs Phase 30 target list:**

| Target capability | Current |
|-----------------|---------|
| `employee.view` / `create` / `edit` / `activate` | ❌ Not in registry |
| `employee.view_sensitive` / `edit_sensitive` | ❌ Not in registry |
| `leave.reject` (explicit) | Merged into `leave.approve` |
| `user.manage` / `role.manage` / `audit.view` | ❌ Not in registry |
| Web capability registry | ❌ Does not exist |

**Critical:** `hasCapability()` is **not imported** by mobile navigation — capabilities are **documented and tested** (`scripts/test-mobile-capabilities.mjs`) but **UI still uses** `canAccess()`, `isHrOrOwnerAccount()`, `canAccessInventory()`.

---

## 5. Existing Mobile Navigation

| Component | Mechanism |
|-----------|-----------|
| `(tabs)/_layout.tsx` | Static tabs: Absensi, Meja Kerja, Rating, Profil |
| `work-dashboard-menu.ts` | Tiles: personal, HR native (`canAccessHrNativeModule`), inventory |
| `hr/_layout.tsx` | `canAccessHrNativeModule` gate |
| `operational-access-gate.ts` | Check-in required for ops (owner/hr bypass) |

**Target mobile menus (staff, manager, HR, etc.)** — partially met by tiles, not by capability matrix. Manager has **no distinct** mobile approval surface beyond shared HR queues (which are HR/owner gated).

---

## 6. Existing Desktop Navigation

| Component | Mechanism |
|-----------|-----------|
| `middleware.ts` | `canAccess(authUser, pathname)` — prefix match |
| `components/Sidebar.tsx` | `canAccess` + `canAccessInventory` + WMS section helpers (`lib/wms/navigation.ts`) |
| HR SDM section | Paths under `/hr/*` in `ROLE_ACCESS_BY_CODE.hr` |

**No capability resolver on web.** Menu visibility = path RBAC only.

---

## 7. Existing Notification Architecture

| Stage | Implementation |
|-------|----------------|
| Event | `lib/notifications/dispatch.ts` — typed event codes |
| Recipient resolution | `lib/notifications/recipients.ts` — `resolveCapabilityHolders()` |
| Capability → role mapping | Hard-coded set → `account_type=owner OR role_code=hr` |
| Scope | Optional `companyIds` via `biz_user_companies` |
| Delivery | `push_tokens`, in-app notifications (Phase 24B+) |

**Gap:** Managers with `leave.approve` scope over team are **not** recipients. Aligning with target model requires extending `resolveCapabilityHolders` to use real capability resolver + manager scope — **after** manager hierarchy exists.

---

## 8. Existing Data Scopes

| Scope | Implemented? | Where |
|-------|--------------|-------|
| OWN | ✅ Partial | leave/attendance/rating APIs filter by `user = @request.auth.id` |
| COMPANY | ✅ Partial | `getAccessibleCompanyIds`, reporting-server, leave-server |
| HR_SCOPE | ✅ Implicit | `isOwnerOrHrAccount` on HR routes |
| MANAGED_EMPLOYEES | ❌ | No manager field |
| MANAGED_TEAM | ❌ | No team graph |

**Company scope on employee create:** `serverCreateEmployeeByHr` does **not** assert company scope or assign `biz_user_companies` membership automatically.

---

## 9. Existing Sensitive Data Handling

| Data class | UI restriction | Server/PB enforcement |
|------------|----------------|------------------------|
| Salary, NIK, NPWP | HR detail + onboard form | profiles HR rules; **self may update own profile fields if PB allows** |
| Compensation overrides | HR detail | Same |
| Bank account | ❌ Not in schema | N/A |
| Identity documents | ❌ Not in schema | N/A |

**No** `employee.view_sensitive` capability. **Managers** do not get HR employee list on web (`manager` role paths exclude `/hr/employees`).

---

## 10. Existing Account Lifecycle

| State | Implementation |
|-------|----------------|
| Pre-login inactive | `users.status=inactive` (HR create) |
| Active | `users.status=active` (Owner UI toggle) |
| Profile incomplete | `profiles.profile_status=incomplete` |
| Login blocked | `app/login/page.tsx` checks status |

**Not implemented:** PENDING, SUSPENDED, REJECTED, screening workflow, approval gates before activation, Access Preview.

---

## 11. Existing Audit Architecture

| Event source | Collections | Employee lifecycle |
|--------------|-------------|-------------------|
| `emitBusinessEventServer` | `biz_activity_events` | ❌ Not emitted |
| HR approval stamps | `leave_requests.*`, `overtime_requests.*` | N/A |
| `sys_audit_log` | Bootstrap only | ❌ Not wired |

---

## 12. Existing PocketBase Rules (summary)

**Production snapshot:** `docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json`

| Collection | Notes |
|------------|-------|
| `users` | HR/Owner can update others; self update limited in prod; **HR may update status** at PB layer while UI restricts to Owner |
| `profiles` | Self OR HR/Owner read/update |
| `leave_requests` | Write-locked (`null` rules) — mutations via Next.js admin PB |
| `attendance_logs` | Staging/production write-lock pattern for HR API |

**Local bootstrap divergences:** broader `users.listRule` (any authenticated user can list users) — **local dev risk only**.

**Policy:** Phase 30 audit does **not** recommend weakening production rules. Field-level PB rules for sensitive profile fields are **not** present — would require schema/options or server-only writes.

---

## 13. Current Gaps

1. No unified **ROLE → CAPABILITY → SCOPE** resolver on web or server.
2. Mobile capabilities **defined but not wired** to navigation.
3. Duplicate RBAC (`lib/rbac.ts` vs `mobile/lib/rbac.ts`) — drift risk (TD-1 from Phase 24A).
4. **No manager/reporting hierarchy** — blocks manager scope and notifications.
5. **No employee lifecycle states** beyond active/inactive.
6. **No Access Preview** feature.
7. **No employee.* capabilities** or sensitive-data capabilities.
8. **No audit** on employee create, activate, profile/role changes.
9. **UI vs PB mismatch** on profile self-update and status activation authority.
10. **Manager role** has no distinct approval authority in server recipient resolver.
11. Employee create lacks **company membership** assignment and scope validation.
12. `staff-basic` **dashboard_access** default vs path access inconsistency.

---

## 14. Security Risks

| Risk | Severity | Description |
|------|----------|-------------|
| UI-only authorization | High | `[id]` page lacks HR guard; relies on PB |
| Profile self-elevation via PB | High | Employee could PATCH salary/NIK if `profiles.updateRule` allows self |
| HR status change at PB | Medium | Production rules may allow HR to activate accounts bypassing Owner UI policy |
| Local users listRule | Low (local) | Any authed user can enumerate users on local PB |
| Capability bypass on mobile | Medium | Nav ignores `hasCapability`; stale path checks |
| No audit on HR mutations | Medium | Forensics gap for lifecycle and sensitive edits |
| Client PB writes for HR data | Medium | Detail page uses client SDK; production relies on rules |
| Privilege creation via HR API | Medium | HR can create users with `role_code=hr` without Owner approval workflow |
| Notification over-broad HR | Low | All approve caps → all HR/owners, not scoped managers |

---

## 15. UX Gaps

- No **Access Preview** before activation.
- No explicit **pending/screening** UI for recruitment.
- HR sees **inactive** employees but activation is Owner-only without in-app explanation of handoff.
- **Manager** has no "My Team" web or mobile surface.
- Employee list does not surface **lifecycle stage** (inactive vs incomplete profile).
- Mixed messages: onboard form sets `profile_status=complete` while `ensureProfile` uses `incomplete`.

---

## 16. Mobile UX Gaps

| Target | Current |
|--------|---------|
| Capability-driven tabs | Static tab bar |
| Manager approvals | HR queues only (HR/owner) |
| HR employee module on mobile | `hr.staff.view` exists; limited native HR screens |
| staff-basic reduced menu | Not enforced via capabilities |
| `inventory.opname` | Capability FUTURE but tile may still show |

---

## 17. Recommended Changes (Phase 31+ — not implemented here)

### Priority 1 — Security alignment (low blast radius)

1. Add **page guards** on `/hr/employees/[id]` and `/hr/employees/incomplete` (`isOwnerOrHrAccount`).
2. **Server-route** all employee profile mutations (mirror leave write-lock pattern) — admin PB only.
3. Split `profiles.updateRule` or use **server-only** patches for sensitive fields; employee self-service API allowlist (phone, address, photo).
4. Align **activation policy**: either Owner-only at PB rules or allow HR with audit + capability `employee.activate`.
5. Emit **audit events** on create, activate, deactivate, role change, sensitive field change (metadata only).

### Priority 2 — Capability wiring

6. Wire mobile nav to `hasCapability()`; deprecate duplicate checks gradually.
7. Add **web capability registry** sharing definitions with mobile (single source file consumed by both).
8. Add `employee.*` and `employee.view_sensitive` capabilities; map HR pages and API routes.

### Priority 3 — Lifecycle & scope

9. Add optional `employment_status` or extend `users.status` enum (pending, suspended, rejected) — **compat analysis first**.
10. Add `profiles.manager` (relation → users) for MANAGED_EMPLOYEES scope.
11. Auto-create `biz_user_companies` on employee onboard.
12. **Access Preview** read-only page: `resolveCapabilities(user)` + scope labels.

### Priority 4 — Notifications & manager

13. Extend `resolveCapabilityHolders` to use capability resolver + manager scope when `leave.approve` targets managers.
14. Employee lifecycle notification events (created, activated).

### Priority 5 — Privileged changes

15. Owner approval workflow for `role_code=hr`, `account_type` changes, `inventory_role=admin` — design only until workflow engine exists.

---

## 18. Files That Would Need Modification (Phase 31+)

| Area | Files |
|------|-------|
| Auth / capabilities | `lib/auth-model.ts`, new `lib/capabilities.ts` (shared), `mobile/lib/capabilities.ts`, `lib/rbac.ts`, `mobile/lib/rbac.ts` |
| HR employee | `app/(dashboard)/hr/employees/**`, `components/hr/HrEmployeeOnboardForm.tsx`, `lib/hr/employee-onboarding-server.ts`, new `app/api/hr/employees/[id]/route.ts` |
| API auth | `lib/hr/api-auth.ts` (requireCapability helper) |
| Scope | `lib/hr/company-scope.ts`, `lib/hr/employee-scope.ts` (new) |
| Notifications | `lib/notifications/recipients.ts`, `lib/notifications/dispatch.ts` |
| Audit | `lib/tenant/activity-server.ts`, new lifecycle event codes |
| Mobile nav | `mobile/lib/work-dashboard-menu.ts`, `mobile/app/(tabs)/_layout.tsx`, `mobile/app/hr/**` |
| Web nav | `components/Sidebar.tsx`, `middleware.ts` (optional capability middleware) |
| Self profile | `app/(dashboard)/profile/**`, new self-service API |
| i18n | `lib/i18n/messages/hr-*.ts` |
| Tests | `scripts/test-mobile-capabilities.mjs`, new HR lifecycle tests |
| PB migrations | `scripts/migrate-*` (local only until approved), **not production until explicit approval** |

---

## 19. Database / Schema Changes Required

| Change | Required? | Risk | Notes |
|--------|-----------|------|-------|
| `users.status` enum extension | Optional | Medium | Map to existing inactive/active first |
| `profiles.manager` → users | **Recommended** | Medium | Enables manager scope |
| `employment_stage` field | Optional | Low | Could use status + profile_status instead |
| `employee_documents` collection | Future | Low | For identity docs |
| Field-level PB rules / separate sensitive collection | **Recommended** | High | Avoid salary on self-update rule |
| Permission / capability table in PB | Optional | High | Prefer code registry Phase 31 |
| `biz_user_companies` auto-link on hire | **Recommended** | Low | Scope correctness |

**Production:** No schema changes in Phase 30. All schema work is **proposed** for gated Phase 31+.

---

## 20. Migration Risks

| Risk | Mitigation |
|------|------------|
| Tightening `profiles.updateRule` breaks self-service | Introduce self-service API with allowlist before rule change |
| Write-locking profiles breaks HR detail page | Move HR edits to API first (leave pattern) |
| Manager field backfill | Nullable `manager`; optional import from department |
| Capability nav regression | Feature flag; parity tests with `test-mobile-capabilities.mjs` |
| Production PB rule change | Staging rehearsal; Phase 25-style verification |
| Owner vs HR activation policy change | Document SOP; audit log before rule tighten |

---

## 21. Backward Compatibility Risks

- Renaming `role_code` values — **do not** without aliases in `normalizeAuthModel`.
- Removing `role` mirror field — may break legacy PB filters.
- Changing `staff-basic` path access — affects existing accounts.
- Splitting presets from `role_code` — preserve `hr_role_preset` reads.
- Mobile RBAC unification — Expo bundle must not import Next-only modules.
- APK users on old versions — server must remain compatible during rollout.

---

## 22. Gap Matrix

| Feature | Current | Target | Gap | Risk | Recommended action | Phase |
|---------|---------|--------|-----|------|-------------------|-------|
| Employee creation | HR/Owner API, inactive | HR creates, inactive | Partial — no company link/audit | Medium | Add scope + audit + membership | 31 |
| Employee activation | Owner UI; PB may allow HR | Owner or governed HR cap | Policy mismatch | Medium | Align PB rules + `employee.activate` | 31 |
| Recruitment workflow | Single-step form | Screening → approved | No stages | Low | Add status enum or workflow | 32 |
| Role assignment | Preset at create only | HR assign ordinary roles | No edit UI | Medium | HR edit API with audit | 31 |
| Privileged role assign | HR can set role=hr | Owner approval | No gate | High | Owner approval workflow | 32 |
| Manager hierarchy | Not stored | profiles.manager | Missing | High | Schema + UI | 31 |
| Capability registry (mobile) | 41 caps, tested | Full target set | employee.* missing | Medium | Extend registry | 31 |
| Capability registry (web) | None | Mirror mobile | Missing | High | Shared `lib/capabilities.ts` | 31 |
| Mobile nav from caps | Path / role checks | `hasCapability` | Unwired | Medium | Refactor nav | 31 |
| Web nav from caps | `canAccess` paths | Capability-aware | Path-only | Medium | Optional bridge layer | 32 |
| Data scope OWN | APIs + PB | OWN | Mostly OK | Low | Document + test | 31 |
| Data scope COMPANY | company-scope | COMPANY | Partial | Medium | Enforce on all HR writes | 31 |
| Data scope MANAGED | N/A | Manager team | Missing | High | Manager field + resolver | 31–32 |
| Sensitive data caps | None | view_sensitive / edit_sensitive | Missing | High | Cap checks in API + UI | 31 |
| Profile self-update | Subset UI, broad PB | Allowlist | PB too permissive | **High** | Self-service API + rules | 31 |
| Access Preview | None | Read-only HR UI | Missing | Low | New page + resolver | 32 |
| Audit employee lifecycle | None | Full metadata | Missing | Medium | emit events | 31 |
| Notifications approve | HR + Owner only | Cap + scope | Manager excluded | Medium | Extend recipients | 32 |
| Leave write path | API admin PB | Server authoritative | OK | Low | Maintain pattern | — |
| attendance write path | API admin PB (staging) | Server authoritative | OK | Low | Maintain pattern | — |
| Duplicate mobile RBAC | `mobile/lib/rbac.ts` | Single auth model | Drift | Medium | Import auth-model; shared paths | 31 |
| inventory_role axis | Preserved | Preserved | OK | Low | Map to capabilities | 31 |
| staff-basic mobile | Path access | Reduced caps | Inconsistent | Low | Fix defaults + caps | 31 |
| HR mobile ≠ desktop | Partial native HR | Operational HR mobile | OK direction | Low | Extend queues only | 32 |
| Self-elevation | API blocks role fields | Prevent all paths | PB/client gaps | **High** | Server-only role changes | 31 |
| sys_audit_log | Unused | Lifecycle audit | Not wired | Low | Defer or merge with biz_activity | 32 |
| Local PB collections | Incomplete vs prod | Parity for UAT | Local gaps | Low | migrate scripts (local only) | UAT |
| Error sanitization | Phase 28/29 | Preserved | OK | Low | No regression | — |

---

## 23. Recommended Implementation Order (Phase 31+)

1. **31a — Security hotfixes (no schema):** Page guards, employee mutation APIs, audit emit on create/activate, activation policy alignment doc + PB rule proposal for staging only.
2. **31b — Capabilities:** Shared registry; `employee.*` + sensitive caps; wire mobile `hasCapability` on Meja Kerja tiles.
3. **31c — Schema (staging first):** `profiles.manager`, `biz_user_companies` on onboard; optional status enum.
4. **31d — Scope resolver:** `MANAGED_EMPLOYEES`, enforce on leave approve API.
5. **32a — Access Preview** read-only UI.
6. **32b — Manager notifications** and mobile approval surfaces.
7. **32c — Privileged role approval** workflow (Owner).
8. **32d — Web capability bridge** (optional; path RBAC remains fallback).

---

## 24. Estimated Complexity

| Workstream | Effort | Notes |
|------------|--------|-------|
| Security / API hardening | M | Follow leave write-lock pattern |
| Capability wiring (mobile) | M | Nav + tests exist |
| Web capability layer | L | Sidebar + middleware |
| Manager hierarchy + scope | L | Schema + backfill + APIs |
| Access Preview | M | Read-only resolver UI |
| Lifecycle states / workflow | L | Process design + migrations |
| Owner approval for privileged roles | L | New workflow |
| Production PB rollout | M | Per Phase 25/26 discipline |

**Overall Phase 31 minimum viable alignment:** ~2–3 engineering weeks.  
**Full target architecture:** multi-phase through Phase 32–33.

---

## 25. Migration Strategy (when authorized — not Phase 30)

1. Implement and test **locally** with `scripts/migrate-local-*` only.
2. **Staging** schema + rules + automated verification (Phase 25 pattern).
3. **Production** schema read-only audit (`verify-production-schema.mjs`) before any change.
4. **Never** weaken production PB rules; add server APIs before tightening client rules.
5. **APK:** capability nav changes require new Android build after staging UAT — out of Phase 30/31 until approved.
6. Rollback: keep path RBAC as fallback behind feature flag for mobile nav.

---

## 26. Recommended Phase 31 (proposal)

**Title:** Employee Lifecycle Security Hardening & Capability Wiring (Foundation)

**Goals:**
- Server-authoritative employee profile writes (HR API)
- Audit events for create / activate / deactivate / sensitive changes
- Page guards + activation policy alignment (documented Owner vs HR)
- Wire mobile navigation to Phase 24A capabilities (no new caps yet)
- Add `employee.view`, `employee.create`, `employee.edit`, `employee.activate` to registry
- Propose staging schema: `profiles.manager` (nullable)

**Explicitly out of Phase 31:**
- Production deploy
- Access Preview UI
- Manager approval notifications
- Owner approval workflow for privileged roles
- New APK release

---

## 27. References (existing phases — do not undo)

| Phase | Achievement |
|-------|-------------|
| 21 | Production schema migration completed |
| 22 | Production compatibility verified |
| 24A | Mobile capability registry + tests |
| 24B/C/D | Notification infrastructure |
| 25 | Staging automated verification |
| 26 | Production application deployed |
| 26A | Production notifications + push_tokens schema |
| 27 | Production Android APK |
| 28 | Mobile bugfixes / error sanitization |
| 29 | Local mobile UX / UAT |

**Architecture docs:** `docs/PHASE_23_MOBILE_RBAC_NOTIFICATION_ARCHITECTURE.md`, `docs/PHASE_24A_MOBILE_RBAC_CAPABILITY_REPORT.md`, `docs/NAVIGATION_SETTINGS_AUDIT.md`, `docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json`.

---

## STOP

Phase 30 ends here. **No Phase 31 implementation** has been started. Await explicit approval before any code, schema, staging, production, or APK work.
