# PHASE 19 — PRODUCTION SCHEMA MIGRATION PLAN

> **READ-ONLY PHASE.** No changes were made to Production.  
> This document is a planning artifact only.  
> All Production changes must be executed manually by the Owner.

---

## 1. Executive Summary

| Item | Value |
|---|---|
| Generated | 2026-08-28 |
| Source of Truth | Local PocketBase (127.0.0.1:8090) + Local source code |
| Target | Production PocketBase (pb.serba.space) |
| Local collections | 21 |
| Production collections | 93 |
| Collections LOCAL\_ONLY (missing from Production) | **9** |
| Collections PROD\_ONLY (extra in Production, not in Local source) | 81 |
| Collections DIFFERENT (exist in both, but fields or rules differ) | **12** |
| Collections that exactly match | 0 |
| **Fields to ADD to Production** | **13** |
| **Collections to CREATE in Production** | **9** |
| Critical blockers | **`mobile_session_nonce` missing, all HR collections missing** |

**Overall Readiness:** `BLOCKED — PRODUCTION SCHEMA INSUFFICIENT FOR LOCAL SOURCE DEPLOYMENT`

Production is missing 9 entire collections (all new HR features) and 4 critical `users` fields and 9 `leave_requests` fields. Deployment without these additions would cause `hr.leave` create to silently drop data, all Rating/Reporting/Findings APIs to return 404/500, and mobile session logout on every web login.

---

## 2. Local Schema Baseline

Collections defined in Local (`bootstrap-local-pb.mjs`) that the source code actively uses:

| Collection | Purpose |
|---|---|
| `users` (auth) | Auth, RBAC, session nonces, context |
| `profiles` | Employee profile, avatar, leave rate |
| `biz_company_profile` | Company entity |
| `biz_stores` | Store entity |
| `biz_sales_orders` | Sales orders (dashboard) |
| `biz_user_companies` | User ↔ company access |
| `biz_activity_events` | Business event log |
| `sys_audit_log` | Action audit log |
| `attendance_logs` | Attendance records |
| `leave_requests` | Leave applications |
| `offices` | Office locations |
| `inv_warehouses` | Warehouses |
| `hr_rating_periods` | Rating cycle definitions |
| `hr_rating_aspects` | Rating criteria |
| `hr_rating_assignments` | Subject ↔ reviewer pairings |
| `hr_rating_reviewers` | Reviewer row per assignment |
| `hr_rating_scores` | Per-aspect scores per reviewer |
| `hr_rating_results` | Computed aggregate per assignment |
| `hr_staff_reports` | Staff-submitted incident reports |
| `hr_findings` | HR/Owner-authored findings |
| `hr_case_attachments` | Attachment metadata + file for reports/findings |

> **Note on naming:** Phase 18 referenced `hr_reports` and `hr_rating_tasks`.  
> The correct Local collection names are `hr_staff_reports` and the set of `hr_rating_*` collections (no single `hr_rating_tasks` exists).

---

## 3. Production Schema Snapshot

Production has **93 collections** covering Inventory (inv\_\*), Business (biz\_\*), Payroll, Attendance, WMS, and HR. The 81 PROD\_ONLY collections are not touched by the Local source code and require no changes.

Production **does NOT have** any of the following collections used by Local source:

- `hr_rating_periods`
- `hr_rating_aspects`
- `hr_rating_assignments`
- `hr_rating_reviewers`
- `hr_rating_scores`
- `hr_rating_results`
- `hr_staff_reports`
- `hr_findings`
- `hr_case_attachments`

---

## 4. Full Difference Matrix

### 4a. LOCAL\_ONLY Collections (missing from Production)

| Collection | Local Fields (count) | Risk | Priority |
|---|---|---|---|
| `hr_rating_periods` | 6 | HIGH — Rating feature 404 | REQUIRED |
| `hr_rating_aspects` | 7 | HIGH — Rating feature 404 | REQUIRED |
| `hr_rating_assignments` | 7 | HIGH — Rating feature 404 | REQUIRED |
| `hr_rating_reviewers` | 6 | HIGH — Rating feature 404 | REQUIRED |
| `hr_rating_scores` | 4 | HIGH — Rating feature 404 | REQUIRED |
| `hr_rating_results` | 10 | HIGH — Rating feature 404 | REQUIRED |
| `hr_staff_reports` | 12 | HIGH — Reporting feature 404 | REQUIRED |
| `hr_findings` | 12 | HIGH — Findings feature 404 | REQUIRED |
| `hr_case_attachments` | 7 (incl. `file`) | HIGH — Attachments feature 404 | REQUIRED |

### 4b. DIFFERENT Collections (shared but diverge)

| Collection | Object | Local | Production | Action Needed | Risk |
|---|---|---|---|---|---|
| `users` | field `mobile_session_nonce` | text, optional | **MISSING** | ADD FIELD | CRITICAL |
| `users` | field `account_type` | select(owner,user), opt | **MISSING** | ADD FIELD | CRITICAL |
| `users` | field `role_code` | text, optional | **MISSING** | ADD FIELD | CRITICAL |
| `users` | field `dashboard_access` | bool, optional | **MISSING** | ADD FIELD | HIGH |
| `users` | field `avatar` | file, optional | **MISSING** | ADD FIELD | LOW (built-in, not used by source) |
| `users` | field `role` | text | select | Type mismatch | LOW (values compatible) |
| `users` | field `locale` | text | select | Type mismatch | LOW (values compatible) |
| `users` | listRule | `@request.auth.id != ""` | RBAC with role/role_code/account_type | Production stricter — keep | NONE |
| `users` | viewRule | `@request.auth.id != ""` | RBAC | Production stricter — keep | NONE |
| `users` | updateRule | `@request.auth.id = id` | Full RBAC (self + hr/owner) | Production stricter — keep | NONE |
| `users` | deleteRule | `id = @request.auth.id` | owner-only | Production stricter — keep | NONE |
| `leave_requests` | field `start_date` | written by source, **not in schema** | **MISSING** | ADD FIELD | HIGH |
| `leave_requests` | field `end_date` | written by source, **not in schema** | **MISSING** | ADD FIELD | HIGH |
| `leave_requests` | field `reason` | written by source, **not in schema** | **MISSING** | ADD FIELD | HIGH |
| `leave_requests` | field `division` | written by source, **not in schema** | **MISSING** | ADD FIELD | HIGH |
| `leave_requests` | field `position` | written by source, **not in schema** | **MISSING** | ADD FIELD | MEDIUM |
| `leave_requests` | field `booking_date` | written by source, **not in schema** | **MISSING** | ADD FIELD | MEDIUM |
| `leave_requests` | field `daily_compensation_rate` | written on approve | **MISSING** | ADD FIELD | MEDIUM |
| `leave_requests` | field `compensation_amount` | written on approve | **MISSING** | ADD FIELD | MEDIUM |
| `leave_requests` | field `rejection_reason` | written on reject, falls back | **MISSING** | ADD FIELD | MEDIUM |
| `leave_requests` | field `date` | text | date | Type mismatch | LOW (source writes YMD string, date field accepts it) |
| `leave_requests` | field `devision` | **MISSING** | text, optional | PROD_ONLY — source handles legacy name | NONE (Production ahead) |
| `leave_requests` | field `hr_action_at` | **MISSING** | date, optional | PROD_ONLY — source writes on approve/reject | NONE (Production ahead) |
| `leave_requests` | field `hr_action_by` | **MISSING** | text, optional | PROD_ONLY — source writes on approve/reject | NONE (Production ahead) |
| `leave_requests` | field `hr_action_name` | **MISSING** | text, optional | PROD_ONLY — source writes on approve/reject | NONE (Production ahead) |
| `leave_requests` | listRule | `@request.auth.id != ""` | RBAC (user = self OR hr/owner) | Production stricter — keep | NONE |
| `leave_requests` | viewRule | `@request.auth.id != ""` | RBAC (user = self OR hr/owner) | Production stricter — keep | NONE |
| `profiles` | field `avatar` | **MISSING from bootstrap** | file, optional | **Production already has it** — avatar feature works | NONE |
| `profiles` | field `office_id` | text | relation | Type mismatch | LOW (ID string stored, compatible) |
| `profiles` | field `email` | text | email type | Minor type | LOW |
| `profiles` | field `profile_status` | select | text | Reversed from expected | LOW |
| `profiles` | field `user` | required=true | required=false | Minor | LOW |
| `profiles` | updateRule | `@request.auth.id != ""` | `user = @request.auth.id OR hr/owner` | Production stricter — BETTER | NONE |
| `biz_user_companies` | listRule | `@request.auth.id != ""` | `@request.auth.id != ''` | Quote style only, functionally identical | NONE |
| `biz_activity_events` | createRule | null (admin) | `""` (public!) | Security: Production OPEN | RISK |
| `biz_activity_events` | updateRule | null (admin) | `""` (public!) | Security: Production OPEN | RISK |
| `biz_activity_events` | deleteRule | null (admin) | `""` (public!) | Security: Production OPEN | RISK |
| `biz_company_profile` | createRule | null (admin) | `""` (public!) | Security: Production OPEN | RISK |
| `sys_audit_log` | listRule | `@request.auth.id != ""` | `""` (public!) | Security: Production OPEN | RISK |
| `sys_audit_log` | createRule | null (admin) | `""` (public!) | Security: Production OPEN | RISK |

---

## 5. Users / Multi-Device Session

### Session Architecture

| Platform | Nonce Field | Behavior |
|---|---|---|
| Web | `users.session_nonce` | Rotated on web login |
| Mobile | `users.mobile_session_nonce` | Rotated on mobile login |

**Design guarantee:** Web login only rotates `session_nonce`. Mobile login only rotates `mobile_session_nonce`. A user logged in on PC + Android can stay logged in simultaneously on both devices. Invalidation of one session does NOT affect the other.

### Field Status

| Field | Local | Production | Status |
|---|---|---|---|
| `session_nonce` | text, optional | text, optional | PASS — already in Production |
| `mobile_session_nonce` | text, optional | **MISSING** | **MISSING — REQUIRED** |

### Impact of Missing `mobile_session_nonce`

If deployed without this field:
- Mobile login calls `pb.collection("users").update(id, { mobile_session_nonce: nonce })` — PocketBase will silently ignore the unknown field
- Mobile auth will not detect forced logout (nonce never stored, never rotated)
- `mobile/lib/auth-session.ts` and `mobile/context/auth.tsx` both reference this field

### Other Missing `users` Fields

| Field | Status | Impact if Missing |
|---|---|---|
| `account_type` | **MISSING** | Production rules reference `@request.auth.account_type = "owner"` — since field absent, claim is always empty, rule still works via `role` check. BUT source code checks `account_type` for dashboard gating. |
| `role_code` | **MISSING** | Same as above — rules fall back to `role` check. Source code uses `role_code` for HR gating in Next.js server. |
| `dashboard_access` | **MISSING** | Dashboard access control broken — all users get default behavior. |

### Production `users` Rules (READ-ONLY observation)

Production rules are **more restrictive** than Local:

| Rule | Local | Production | Verdict |
|---|---|---|---|
| listRule | auth check only | auth + role/role_code/account_type check | Production BETTER — keep |
| viewRule | auth check only | auth + RBAC | Production BETTER — keep |
| updateRule | `id = auth.id` | id = self OR hr/owner (with role/status guard) | Production BETTER — keep |
| deleteRule | `id = auth.id` | owner-only | Production STRICTER — keep |

**Do NOT change Production `users` rules. They are superior to Local.**

---

## 6. Leave

### Field Audit

| Field | Local Schema | Production Schema | Source Writes? | Action |
|---|---|---|---|---|
| `user` | relation (optional) | relation (optional) | Yes | PASS |
| `date` | text | date | Yes (start_date as fallback) | LOW RISK — type mismatch |
| `status` | select | select | Yes | PASS |
| `note` | text | text | Yes | PASS |
| `start_date` | **NOT in schema** | **NOT in schema** | **YES — every create** | **ADD TO PRODUCTION** |
| `end_date` | **NOT in schema** | **NOT in schema** | **YES — every create** | **ADD TO PRODUCTION** |
| `reason` | **NOT in schema** | **NOT in schema** | **YES — every create** | **ADD TO PRODUCTION** |
| `division` | **NOT in schema** | **NOT in schema** | **YES — quota check** | **ADD TO PRODUCTION** |
| `position` | **NOT in schema** | **NOT in schema** | Yes | ADD TO PRODUCTION |
| `booking_date` | **NOT in schema** | **NOT in schema** | Yes | ADD TO PRODUCTION |
| `daily_compensation_rate` | **NOT in schema** | **NOT in schema** | Yes (on approve) | ADD TO PRODUCTION |
| `compensation_amount` | **NOT in schema** | **NOT in schema** | Yes (on approve) | ADD TO PRODUCTION |
| `rejection_reason` | **NOT in schema** | **NOT in schema** | Yes (on reject, with fallback) | ADD TO PRODUCTION |
| `devision` | MISSING | text, optional | Source writes both `division` + `devision` | PASS (Production ahead) |
| `hr_action_at` | MISSING | date, optional | Yes (on approve/reject) | PASS (Production ahead) |
| `hr_action_by` | MISSING | text, optional | Yes (on approve/reject) | PASS (Production ahead) |
| `hr_action_name` | MISSING | text, optional | Yes (on approve/reject) | PASS (Production ahead) |

> **Important:** `start_date`, `end_date`, and `reason` are absent from **both** Local bootstrap and Production. Source code writes them on every `leave_requests.create()`. PocketBase silently ignores fields not in schema, meaning multi-day leaves submit without storing `end_date`, and `reason` is permanently lost. This is a data integrity bug in Production AND Local.

### `end_date` / `reason` Required?

Checking `leave-server.ts` → `serverSubmitLeave()`:
- `start_date` and `end_date` are required **by source logic** (line 321: `if (!start_date || !end_date) return error`)
- `reason` has a default fallback (`DEFAULT_LEAVE_BOOKING_REASON`) — it is **optional** in schema terms

**Verdict:**
- `start_date` — schema type: text, required: **false** (source validates before submit, not PB)
- `end_date` — schema type: text, required: **false**
- `reason` — schema type: text, required: **false**

### Leave Rules (PASS)

Production `leave_requests` rules are **more restrictive** than Local — employees only see their own leaves, HR/Owner see all. **Do NOT change.**

---

## 7. Rating

### Status: MISSING — ALL 6 COLLECTIONS ABSENT FROM PRODUCTION

All HR Rating collections are LOCAL\_ONLY and must be created in Production before any rating features are usable.

#### `hr_rating_periods`

| Field | Type | Required |
|---|---|---|
| `name` | text | true |
| `start_date` | date | false |
| `end_date` | date | false |
| `status` | select: draft, open, in\_progress, closed, cancelled | false |
| `description` | text | false |
| `created_by` | relation → users | false |

Rules: **Admin-only** (listRule=null, viewRule=null, createRule=null, updateRule=null, deleteRule=null)

#### `hr_rating_aspects`

| Field | Type | Required |
|---|---|---|
| `code` | text | true |
| `name` | text | true |
| `description` | text | false |
| `sort_order` | number | false |
| `is_active` | bool | false |
| `min_score` | number | false |
| `max_score` | number | false |

Rules: **Admin-only**

#### `hr_rating_assignments`

| Field | Type | Required |
|---|---|---|
| `period` | relation → hr\_rating\_periods | true |
| `subject` | relation → users | true |
| `reviewer_count` | number | false |
| `assignment_method` | select: smart\_random, manual | false |
| `status` | select: draft, assigned, in\_progress, completed, cancelled | false |
| `selection_evidence_json` | text | false |
| `created_by` | relation → users | false |

Rules: **Admin-only**

#### `hr_rating_reviewers`

| Field | Type | Required |
|---|---|---|
| `assignment` | relation → hr\_rating\_assignments | true |
| `reviewer` | relation → users | true |
| `status` | select: assigned, draft, submitted, locked | false |
| `relevance_tier` | text | false |
| `selection_note` | text | false |
| `submitted_at` | date | false |

Rules: **Admin-only**

#### `hr_rating_scores`

| Field | Type | Required |
|---|---|---|
| `reviewer_row` | relation → hr\_rating\_reviewers | true |
| `aspect` | relation → hr\_rating\_aspects | true |
| `score` | number | false |
| `comment` | text | false |

Rules: **Admin-only**

#### `hr_rating_results`

| Field | Type | Required |
|---|---|---|
| `assignment` | relation → hr\_rating\_assignments | true |
| `overall_score` | number | false |
| `category` | text | false |
| `respondent_count` | number | false |
| `aspect_scores_json` | text | false |
| `summary` | text | false |
| `strengths` | text | false |
| `improvements` | text | false |
| `suggestions` | text | false |
| `calculated_at` | date | false |

Rules: **Admin-only**

### Creation Order (due to relation dependencies)

```
hr_rating_periods  ──┐
hr_rating_aspects  ──┤──> hr_rating_assignments ──> hr_rating_reviewers ──> hr_rating_scores
                       └──────────────────────────> hr_rating_results
```

---

## 8. Reporting

### Status: MISSING — ALL 3 COLLECTIONS ABSENT FROM PRODUCTION

#### `hr_staff_reports`

| Field | Type | Required |
|---|---|---|
| `title` | text | **true** |
| `body` | text | **true** |
| `category` | select: facility, safety, misconduct, operations, other | false |
| `status` | select: draft, submitted, in\_review, closed | false |
| `priority` | select: low, medium, high | false |
| `location_text` | text | false |
| `created_by` | relation → users | **true** |
| `company_id` | text | false |
| `hr_note` | text | false |
| `submitted_at` | date | false |
| `closed_at` | date | false |
| `closed_by` | relation → users | false |

Rules: **Admin-only** (source code uses `getInventoryAdminPb()` for all writes)

Access control is enforced at the Next.js API layer:
- Employees: can only read/write their own reports
- HR: can read/close/annotate reports within their company scope
- Owner: full access

#### `hr_findings`

Same schema as `hr_staff_reports`. Access:
- Employees: **cannot list or view findings** (403 enforced by `reporting-server.ts`)
- HR + Owner: full read/write/close

#### `hr_case_attachments`

| Field | Type | Required |
|---|---|---|
| `kind` | select: report, finding | false |
| `parent_id` | text | **true** |
| `original_name` | text | false |
| `mime` | text | false |
| `size` | number | false |
| `created_by` | relation → users | false |
| **`file`** | **file** | **false** |

> **⚠ Bootstrap Bug:** `file` field is **absent from `bootstrap-local-pb.mjs`** but IS required by `reporting-server.ts` line 401 (`file: new File([blob], name, { type })`). When creating this collection in Production, the `file` PocketBase file-type field MUST be included. Local bootstrap must also be fixed separately (out of scope for Phase 19).

**Attachment security:** Files are never served as public PocketBase URLs. Source code reads file bytes via admin PocketBase and streams them through auth-gated Next.js routes (`/api/hr/reports/:id/attachments/:attId`) with `Cache-Control: private, no-store`.

Rules: **Admin-only** (all writes go through Next.js admin PB)

---

## 9. Findings

### Status: MISSING — COLLECTION ABSENT FROM PRODUCTION

See Section 8 for full `hr_findings` schema. Distinct access controls vs reports:

| Actor | Can List | Can View Own | Can View Others | Can Create | Can Close |
|---|---|---|---|---|---|
| Employee | NO (403) | NO | NO | NO | NO |
| HR | YES (scope-filtered) | YES | YES (same company) | YES | YES |
| Owner | YES (all) | YES | YES | YES | YES |

Source enforces: `if (kind === "finding" && !ctx.isOwner && !ctx.isHr) throw HrApiError(403)`

---

## 10. Profile

### Avatar / File Permissions

| Item | Production | Local Bootstrap | Action |
|---|---|---|---|
| `profiles.avatar` | **EXISTS** (file type) | NOT in bootstrap schema | **PASS — Production is ahead** |
| Avatar upload endpoint | Via Next.js API (admin PB) | Same | PASS |
| Direct PB file URL public? | Blocked by PocketBase rule | Blocked | PASS |

The source (Phase 18) added avatar upload/delete to both web and mobile. Both use Next.js server to write avatar to `profiles` via admin PocketBase. Production already has the `profiles.avatar` field — this feature will work on Production immediately after deployment.

### `profiles.updateRule`

| Rule | Local | Production |
|---|---|---|
| updateRule | `@request.auth.id != ""` (any logged-in user) | `user = @request.auth.id OR hr/owner` |

**Production rule is BETTER** for security. Users can only update their own profile. HR/Owner can update any profile. **Do NOT change Production rule.**

> **Recommendation:** Tighten Local bootstrap to match Production rule after Phase 19.

### Profile Capabilities (Production-ready)

| Capability | Status |
|---|---|
| User uploads own photo | PASS (updateRule: `user = @request.auth.id`) |
| User replaces own photo | PASS |
| User deletes own photo (Hapus foto, Phase 18) | PASS |
| User cannot update other users' profiles | PASS (updateRule blocks) |
| Default avatar without photo | PASS (avatar field optional) |
| HR/Owner can manage employee profiles | PASS (rule allows) |

---

## 11. Rules & Security

### Security Risk: Open Rules in Production

The following Production collections have rules set to `""` (public access — no authentication required). Local source defines these as auth-required or admin-only:

| Collection | Rule | Local | Production | Risk |
|---|---|---|---|---|
| `biz_activity_events` | listRule | auth required | `""` PUBLIC | RISK |
| `biz_activity_events` | viewRule | auth required | `""` PUBLIC | RISK |
| `biz_activity_events` | createRule | admin only | `""` PUBLIC | RISK |
| `biz_activity_events` | updateRule | admin only | `""` PUBLIC | RISK |
| `biz_activity_events` | deleteRule | admin only | `""` PUBLIC | RISK |
| `biz_company_profile` | listRule | auth required | `""` PUBLIC | RISK |
| `biz_company_profile` | createRule | admin only | `""` PUBLIC | RISK |
| `sys_audit_log` | listRule | auth required | `""` PUBLIC | RISK |
| `sys_audit_log` | createRule | admin only | `""` PUBLIC | RISK |

> **These rules cannot be changed in Phase 19 (READ-ONLY phase).** Owner should tighten them before going live.

### Security PASS Items

| Item | Status |
|---|---|
| `users` listRule / viewRule — Production RBAC | PASS (stricter than Local) |
| `profiles` updateRule — self-only for employees | PASS |
| `leave_requests` listRule — self-only for employees | PASS |
| `hr_staff_reports` — admin-only (source enforces RBAC in Next.js) | PASS |
| `hr_findings` — admin-only (source enforces employee block) | PASS |
| `hr_case_attachments` — admin-only (files served via auth-gated routes) | PASS |
| All HR rating collections — admin-only | PASS |

---

## 12. Required Production Changes

These changes are **mandatory** before deploying Local source to Production.

### GROUP A — `users` Field Additions

| # | Collection | Object | Change | Risk | Notes |
|---|---|---|---|---|---|
| A1 | `users` | `mobile_session_nonce` field | ADD: text, optional | LOW | Mobile session will not rotate without this |
| A2 | `users` | `account_type` field | ADD: select(owner, user), optional | LOW | Auth rules + dashboard gating |
| A3 | `users` | `role_code` field | ADD: text, optional | LOW | HR gating in Next.js server |
| A4 | `users` | `dashboard_access` field | ADD: bool, optional | LOW | Dashboard access control |

### GROUP B — `leave_requests` Field Additions

| # | Collection | Object | Change | Risk | Notes |
|---|---|---|---|---|---|
| B1 | `leave_requests` | `start_date` field | ADD: text, optional | LOW | Source writes on every create |
| B2 | `leave_requests` | `end_date` field | ADD: text, optional | LOW | Source writes on every create; multi-day leaves broken without it |
| B3 | `leave_requests` | `reason` field | ADD: text, optional | LOW | Source writes on every create; reason silently lost without it |
| B4 | `leave_requests` | `division` field | ADD: text, optional | LOW | Source writes for quota check (complement to existing `devision`) |
| B5 | `leave_requests` | `position` field | ADD: text, optional | LOW | Source writes on create |
| B6 | `leave_requests` | `booking_date` field | ADD: text, optional | LOW | Source writes on create |
| B7 | `leave_requests` | `daily_compensation_rate` field | ADD: number, optional | LOW | Source writes on approve |
| B8 | `leave_requests` | `compensation_amount` field | ADD: number, optional | LOW | Source writes on approve |
| B9 | `leave_requests` | `rejection_reason` field | ADD: text, optional | LOW | Source writes on reject (has fallback to `note`) |

### GROUP C — HR Reporting Collections

| # | Collection | Change | Risk | Dependency |
|---|---|---|---|---|
| C1 | `hr_staff_reports` | CREATE with full schema (Section 8) | MEDIUM | users collection ID |
| C2 | `hr_findings` | CREATE with full schema (Section 9) | MEDIUM | users collection ID |
| C3 | `hr_case_attachments` | CREATE with full schema **including `file` field** (Section 8) | MEDIUM | users collection ID |

### GROUP D — HR Rating Collections

| # | Collection | Change | Risk | Dependency |
|---|---|---|---|---|
| D1 | `hr_rating_periods` | CREATE | MEDIUM | users |
| D2 | `hr_rating_aspects` | CREATE | MEDIUM | none |
| D3 | `hr_rating_assignments` | CREATE | MEDIUM | hr\_rating\_periods, users |
| D4 | `hr_rating_reviewers` | CREATE | MEDIUM | hr\_rating\_assignments, users |
| D5 | `hr_rating_scores` | CREATE | MEDIUM | hr\_rating\_reviewers, hr\_rating\_aspects |
| D6 | `hr_rating_results` | CREATE | MEDIUM | hr\_rating\_assignments |

---

## 13. Optional Production Changes

These are improvements but not blockers:

| # | Collection | Object | Recommendation | Risk |
|---|---|---|---|---|
| O1 | `biz_activity_events` | listRule/createRule/etc. | Tighten from `""` to `@request.auth.id != ""` | LOW |
| O2 | `biz_company_profile` | listRule/createRule | Tighten from `""` to `@request.auth.id != ""` | LOW |
| O3 | `sys_audit_log` | listRule/createRule | Tighten from `""` to `@request.auth.id != ""` | LOW |
| O4 | `users` | `avatar` field | ADD (built-in PB auth avatar, not used by source) | LOW |

---

## 14. Migration Order

Execute in this exact order to satisfy relation dependencies:

```
STEP 1 — ADD fields to users (A1–A4)
  No dependencies. Safe to run first.
  Fields: mobile_session_nonce, account_type, role_code, dashboard_access

STEP 2 — ADD fields to leave_requests (B1–B9)
  No dependencies.
  Fields: start_date, end_date, reason, division, position,
          booking_date, daily_compensation_rate, compensation_amount,
          rejection_reason

STEP 3 — CREATE hr_staff_reports (C1)
  Requires: users collection ID

STEP 4 — CREATE hr_findings (C2)
  Requires: users collection ID

STEP 5 — CREATE hr_case_attachments (C3)
  Requires: users collection ID
  ⚠ Must include file field (file type)

STEP 6 — CREATE hr_rating_periods (D1)
  Requires: users collection ID

STEP 7 — CREATE hr_rating_aspects (D2)
  No relation dependencies

STEP 8 — CREATE hr_rating_assignments (D3)
  Requires: hr_rating_periods ID, users ID (from Step 6)

STEP 9 — CREATE hr_rating_reviewers (D4)
  Requires: hr_rating_assignments ID (from Step 8), users ID

STEP 10 — CREATE hr_rating_scores (D5)
  Requires: hr_rating_reviewers ID (from Step 9), hr_rating_aspects ID (from Step 7)

STEP 11 — CREATE hr_rating_results (D6)
  Requires: hr_rating_assignments ID (from Step 8)
```

---

## 15. Backup Requirement

| Scope | Required? | Reason |
|---|---|---|
| Full Production PocketBase snapshot | **YES** | Standard pre-migration protection |
| `users` collection export | **YES** | Field additions cannot corrupt data but a backup is prudent |
| `leave_requests` collection export | **YES** | Adding fields to collection with live data |
| `profiles` collection export | RECOMMENDED | No schema changes required but has avatar data |
| HR rating/reporting collections | N/A | Collections do not yet exist in Production |

**Backup method:** Use PocketBase Admin UI → Settings → Export / Backup (or file-system copy of `pb_data/` directory on the Production server).

---

## 16. Rollback Plan

For each migration step, the rollback is:

| Step | Rollback |
|---|---|
| A1 — ADD `users.mobile_session_nonce` | Remove field only if no data was written to it. Source will revert to missing mobile session nonce behavior (mobile nonce not persisted). |
| A2–A4 — ADD users fields | Remove fields. No existing records affected (fields were absent, new fields default to null). |
| B1–B9 — ADD `leave_requests` fields | Remove fields. Existing leave records unaffected (fields were absent, all new records would default to null on rollback). |
| C1–C3 — CREATE HR reporting collections | DELETE empty collections. No data at risk (freshly created). |
| D1–D6 — CREATE HR rating collections | DELETE in reverse order (scores/results → reviewers → assignments → periods/aspects). |

**Rollback principle:** All changes are additive. No field or collection has been removed from Production. Rolling back means removing newly added fields or freshly created empty collections. No existing Production data is at risk.

---

## 17. Production Risk Summary

| Risk | Severity | Description |
|---|---|---|
| Mobile session not invalidating on web login | **CRITICAL** | `mobile_session_nonce` missing → mobile auth broken post-deploy |
| All HR Rating APIs return 404/500 | **CRITICAL** | All 6 rating collections missing |
| All HR Reporting APIs return 404/500 | **CRITICAL** | hr\_staff\_reports, hr\_findings missing |
| All Attachment upload/view fails | **CRITICAL** | hr\_case\_attachments missing |
| Leave `end_date`/`reason` silently dropped | **HIGH** | Multi-day leaves lose end date; reason never stored |
| `account_type` / `role_code` checks always false | **HIGH** | Next.js server HR gating may fail for some users |
| `biz_activity_events` open to public | **MEDIUM** | Business event log readable/writable without auth in Production |
| `sys_audit_log` open to public | **MEDIUM** | Audit log readable without auth in Production |
| `leave_requests.date` type mismatch | **LOW** | Text vs date type — source writes YMD string; PB date accepts it |
| `users.role` type mismatch | **LOW** | Text vs select — existing values already conform to select options |
| `profiles.profile_status` type reversed | **LOW** | select (Local) vs text (Prod) — Production text field is more permissive |

---

## 18. Final Deployment Readiness

### Production Safety Checklist

| Question | Answer |
|---|---|
| 1. Is Production schema sufficient for Local source deployment? | **NO** — 9 collections missing, 13 fields missing |
| 2. What MUST be added? | Groups A (4 fields), B (9 fields), C (3 collections), D (6 collections) |
| 3. What is optional? | Group O (rule tightening, users.avatar) |
| 4. Any Production fields at risk of overwrite? | **NO** — all changes are additive |
| 5. Any Production collections different from Local? | YES — 12 collections differ (see Section 4b), Production rules are generally stricter (good) |
| 6. Any rules different? | YES — Production rules for users/profiles/leave are STRICTER (keep). `biz_activity_events`/`sys_audit_log` are dangerously OPEN (fix optionally) |
| 7. Migration dependencies? | YES — Rating collections must be created in order (Section 14) |
| 8. Backup required? | **YES** — full snapshot before any changes |
| 9. Downtime needed? | **NO** — all changes additive, no field/collection removal |
| 10. Safest change order? | Users → Leave → HR Reporting → HR Rating (Sections 12–14) |

### Per-Feature Readiness

| Feature | Status | Blocker |
|---|---|---|
| Web Login / Dashboard | PARTIAL | `account_type`, `dashboard_access` missing from users |
| Mobile Login | PARTIAL | `mobile_session_nonce` missing |
| Multi-device Session (PC + Android) | BLOCKED | `mobile_session_nonce` missing |
| Profile / Avatar | PASS | `profiles.avatar` already exists in Production |
| Leave Submit | PARTIAL | `start_date`, `end_date`, `reason`, `division` missing — data silently dropped |
| Leave Approve / Reject | PARTIAL | `compensation_amount`, `daily_compensation_rate`, `rejection_reason` missing |
| Leave List | PASS | Collection exists, RBAC rules already correct |
| HR Rating (all) | BLOCKED | All 6 rating collections missing |
| HR Staff Reports | BLOCKED | `hr_staff_reports` missing |
| HR Findings | BLOCKED | `hr_findings` missing |
| HR Attachments | BLOCKED | `hr_case_attachments` missing |

---

## FINAL STATUS

```
FINAL STATUS = READY FOR PRODUCTION MIGRATION REVIEW

All requirements are fully mapped.
No changes were made to Production.
All findings are based on READ-ONLY comparison of Local vs Production schemas.

Owner must execute migrations manually in the order specified (Section 14)
before deploying the Local source to Production.
```

---

*Generated by Phase 19 audit — `docs/_schema_diff.json` contains the full machine-readable diff.*  
*Comparison script: `scripts/compare-schema-local-vs-prod.mjs`*
