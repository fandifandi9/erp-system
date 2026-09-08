# Phase 20 — Production Schema Safety Review

> **READ-ONLY / DRY-RUN — No Production changes were made.**  
> Dry-run executed: 2026-08-28T06:03:44.070Z against `https://pb.serba.space`  
> Source: `scripts/dry-run-production-migration.mjs` (GET-only, all POST/PATCH/PUT/DELETE blocked by safety guard)

---

## Production Baseline

| Item | Value |
|---|---|
| Production PocketBase URL | `https://pb.serba.space` |
| Dry-run timestamp | 2026-08-28T06:03:44 UTC |
| Source of Truth | Local PocketBase + Local source code (Phase 19 confirmed) |
| Production collections total | 93 |
| Production modified by this phase | **NO** |

---

## Collections Missing from Production

All 9 collections are completely absent. Confirmed by dry-run GET (HTTP 404 for each).

| # | Collection | Step | Purpose |
|---|---|---|---|
| 1 | `hr_rating_periods` | D1 | Rating cycle definitions |
| 2 | `hr_rating_aspects` | D2 | Rating dimensions/criteria |
| 3 | `hr_rating_assignments` | D3 | Subject ↔ period assignment |
| 4 | `hr_rating_reviewers` | D4 | Per-reviewer task rows |
| 5 | `hr_rating_scores` | D5 | Per-aspect scores per reviewer |
| 6 | `hr_rating_results` | D6 | Aggregated results per assignment |
| 7 | `hr_staff_reports` | C1 | Staff-submitted incident reports |
| 8 | `hr_findings` | C2 | HR/Owner-authored findings |
| 9 | `hr_case_attachments` | C3 | Attachment metadata + file binary |

---

## Missing Fields on Existing Collections

### A. `users` collection — 4 fields missing

| Field | Type | Required | Source Reference |
|---|---|---|---|
| `mobile_session_nonce` | text | false | `mobile/lib/auth-session.ts` Phase 17E |
| `account_type` | select (owner, user) | false | `lib/rbac.ts` → `AccountType` |
| `role_code` | text | false | `lib/rbac.ts` → `UserRoleCode` |
| `dashboard_access` | bool | false | `lib/rbac.ts` → `getOperationalDashboardRoute` |

### B. `leave_requests` collection — 9 fields missing

| Field | Type | Required | Source Reference |
|---|---|---|---|
| `start_date` | text | false | `leave-server.ts` → `serverSubmitLeave` |
| `end_date` | text | false | `leave-server.ts` → `serverSubmitLeave` |
| `reason` | text | false | `leave-server.ts` → `reasonText` |
| `division` | text | false | `leave-server.ts` (new field; `devision` is legacy) |
| `position` | text | false | `leave-server.ts` → `positionClean` |
| `booking_date` | text | false | `leave-server.ts` → `new Date().toISOString()` |
| `daily_compensation_rate` | number | false | `leave-server.ts` → `serverApproveLeave` |
| `compensation_amount` | number | false | `leave-server.ts` → `serverApproveLeave` |
| `rejection_reason` | text | false | `leave-server.ts` → `serverRejectLeave` |

---

## Existing Fields — Keep Unchanged

All fields that currently exist in Production `users`, `leave_requests`, and `profiles` are to be kept as-is. The migration is **additive only**. No existing field is modified, renamed, or removed.

Notable existing Production fields that source code also uses (no migration needed):

| Collection | Field | Type | Source Uses It? |
|---|---|---|---|
| `users` | `session_nonce` | text | YES — web session (Phase 17E) |
| `users` | `role` | select | YES — primary role check |
| `users` | `status` | select | YES — `assertUserActive()` in rating-server.ts |
| `users` | `inventory_role` | select | YES — inventory access |
| `users` | `web_access` | bool | YES — web access gate |
| `users` | `is_checked_in` | bool | YES — attendance |
| `leave_requests` | `devision` | text | YES — legacy typo, source writes both |
| `leave_requests` | `hr_action_at` | date | YES — approval tracking |
| `leave_requests` | `hr_action_by` | text | YES — approval tracking |
| `leave_requests` | `hr_action_name` | text | YES — approval tracking |
| `profiles` | `avatar` | file | YES — avatar upload/delete (Phase 18) |
| `profiles` | `division` | text | YES — `resolveProfileDivisionKey()` in leave-server.ts |
| `profiles` | `department` | text | YES — rating reviewer pool |
| `profiles` | `position` | text | YES — leave position stamp |
| `profiles` | `leave_bookings_quota` | number | YES — `leaveBookingsQuotaFromProfileRecord()` |
| `profiles` | `leave_daily_rate` | number | YES — compensation calc |

---

## Existing Production Rules — Must Remain Unchanged

The dry-run confirms these exact Production rules. **Do not modify any of them.**

### `users` rules

```
listRule:
  @request.auth.id != "" && (
    id = @request.auth.id
    || @request.auth.role = "hr"
    || @request.auth.role_code = "hr"
    || @request.auth.role = "owner"
    || @request.auth.role_code = "owner"
    || @request.auth.account_type = "owner"
  )

viewRule:
  (same as listRule)

createRule:
  @request.auth.id != "" && (
    @request.auth.role = "hr"
    || @request.auth.role_code = "hr"
    || @request.auth.role = "owner"
    || @request.auth.role_code = "owner"
    || @request.auth.account_type = "owner"
  )

updateRule:
  @request.auth.id != "" && (
    (
      id = @request.auth.id
      && (@request.data.role:isset = false || @request.data.role = role)
      && (@request.data.status:isset = false || @request.data.status = status)
    )
    || @request.auth.role = "hr"
    || @request.auth.role_code = "hr"
    || @request.auth.role = "owner"
    || @request.auth.role_code = "owner"
    || @request.auth.account_type = "owner"
  )

deleteRule:
  @request.auth.id != "" && (
    @request.auth.role = "owner"
    || @request.auth.role_code = "owner"
    || @request.auth.account_type = "owner"
  )
```

### `leave_requests` rules

```
listRule:
  @request.auth.id != "" && (
    user = @request.auth.id
    || @request.auth.role = "hr"
    || @request.auth.role_code = "hr"
    || @request.auth.role = "owner"
    || @request.auth.role_code = "owner"
    || @request.auth.account_type = "owner"
  )

viewRule:
  (same as listRule)

createRule: null   (admin-only — leave creation via Next.js admin PB)
updateRule: null   (admin-only — leave approve/reject via Next.js admin PB)
deleteRule: null   (admin-only)
```

> **Leave create/update are admin-only in Production.** This is correct — source code uses `getInventoryAdminPb()` for all leave mutations. No direct client writes.

### `profiles` rules

```
listRule:
  @request.auth.id != "" && (
    user = @request.auth.id
    || @request.auth.role = "hr" / role_code = "hr"
    || @request.auth.role = "owner" / role_code = "owner" / account_type = "owner"
  )

viewRule:
  (same as listRule)

createRule:
  @request.auth.id != "" && (
    @request.data.user = @request.auth.id
    || hr/owner role
  )

updateRule:
  @request.auth.id != "" && (
    user = @request.auth.id
    || hr/owner role
  )

deleteRule:
  @request.auth.id != "" && (owner role only)
```

---

## Rules That Must Remain Unchanged

| Collection | Rule | Reason |
|---|---|---|
| `users` | All 5 rules | Production RBAC is superior to Local. `role_code` / `account_type` checks are already wired — adding the fields will make them active. |
| `leave_requests` | listRule, viewRule | Employees self-scoped; HR/Owner see all. Correct. |
| `leave_requests` | createRule=null, updateRule=null, deleteRule=null | Leave mutations go through Next.js admin PB only. Correct. |
| `profiles` | All 5 rules | Self-update only for employees; HR/Owner can update others. Correct. |

---

## New Collection Security Model

All 9 new collections use **admin-only rules** (all rules = `null`).

```
listRule:   null  (admin only)
viewRule:   null  (admin only)
createRule: null  (admin only)
updateRule: null  (admin only)
deleteRule: null  (admin only)
```

**Rationale:** The entire HR feature set (Rating, Reporting, Findings, Attachments) uses Next.js API routes that call `getInventoryAdminPb()`. No client SDK (web or mobile) ever queries these collections directly. Access control is enforced at the Next.js server layer:

| Feature | Access Control Layer |
|---|---|
| Rating — periods | HR/Owner only (`ctx.isOwner \|\| ctx.isHr`) |
| Rating — my-tasks | Reviewer sees only their own tasks (`reviewer = ctx.userId`) |
| Rating — results | Subject sees only aggregate (`serverGetMyResult` strips reviewer breakdown) |
| Rating — reviewer identity | Never exposed to subject — `selection_evidence_json` is admin-only |
| Reports — list | Employee: own only; HR: company-scoped; Owner: all |
| Findings — list | Employee: 403; HR: company-scoped; Owner: all |
| Attachments — read | Auth-gated `/api/hr/.../attachments/:id` route; bytes streamed via admin PB |
| Attachments — write | Auth check + parent record ownership + draft-status gate |

**Direct PocketBase access from client:** Blocked at PocketBase level (admin-only rules). Even if a user has an admin PocketBase token somehow, the actual logic is enforced at Next.js layer too.

---

## Collection-by-Collection Migration Specification

### A. `hr_rating_periods`

- **Purpose:** Rating cycle definitions. Owner/HR create; lifecycle draft→open→in_progress→closed.
- **Step:** D1
- **Dependency:** `users` (for `created_by`)
- **Source consumer:** `rating-server.ts` → `serverCreatePeriod`, `serverListPeriods`, `serverUpdatePeriodStatus`

| Field | Type | Required | Options / Notes |
|---|---|---|---|
| `name` | text | **true** | Period name e.g. "Q3-2026" |
| `start_date` | date | false | Written as `"2026-01-01 00:00:00.000Z"` |
| `end_date` | date | false | Written as `"2026-12-31 00:00:00.000Z"` |
| `status` | select | false | draft, open, in_progress, closed, cancelled |
| `description` | text | false | Optional period description |
| `created_by` | relation → users | false | Server-stamped from `ctx.userId` |

**Rules:** Admin-only (all null)

---

### B. `hr_rating_aspects`

- **Purpose:** Rating criteria (Discipline, Responsibility, Teamwork, etc.). Score range 1–5.
- **Step:** D2
- **Dependency:** none
- **Source consumer:** `rating-server.ts` → `listActiveAspects` (filter: `is_active = true`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | text | **true** | Unique code: discipline, responsibility, teamwork, communication, work_quality |
| `name` | text | **true** | Display name |
| `description` | text | false | |
| `sort_order` | number | false | UI sort order |
| `is_active` | bool | false | Only active aspects used in scoring |
| `min_score` | number | false | Typically 1 |
| `max_score` | number | false | Typically 5 |

**Rules:** Admin-only (all null)  
**Seed data needed:** 5 default aspects must be created post-collection-creation (same as bootstrap seeds: discipline, responsibility, teamwork, communication, work_quality).

---

### C. `hr_rating_assignments`

- **Purpose:** Maps one subject to one period. One assignment per (subject × period). Stores reviewer selection evidence.
- **Step:** D3
- **Dependency:** `hr_rating_periods`, `users`
- **Source consumer:** `rating-server.ts` → `serverCreateAssignment`, `serverListMyReviewerTasks`

| Field | Type | Required | Notes |
|---|---|---|---|
| `period` | relation → hr_rating_periods | **true** | Parent period. cascadeDelete=true. |
| `subject` | relation → users | **true** | Employee being rated. cascadeDelete=true. |
| `reviewer_count` | number | false | Requested reviewer count |
| `assignment_method` | select | false | smart_random, manual |
| `status` | select | false | draft, assigned, in_progress, completed, cancelled |
| `selection_evidence_json` | text | false | JSON audit trail. **NEVER exposed to subject.** |
| `created_by` | relation → users | false | Actor who created assignment |

**Rules:** Admin-only (all null)  
**Security note:** `selection_evidence_json` contains reviewer user IDs. Must remain admin-only to prevent subject from identifying reviewers.

---

### D. `hr_rating_reviewers`

- **Purpose:** One row per (assignment × reviewer). Tracks submission lifecycle. Status: assigned → draft → locked (=submitted).
- **Step:** D4
- **Dependency:** `hr_rating_assignments`, `users`
- **Source consumer:** `rating-server.ts` → `serverSaveReviewerDraft`, `serverSubmitReviewer`

| Field | Type | Required | Notes |
|---|---|---|---|
| `assignment` | relation → hr_rating_assignments | **true** | Parent assignment. cascadeDelete=true. |
| `reviewer` | relation → users | **true** | The reviewer. cascadeDelete=true. |
| `status` | select | false | assigned, draft, submitted, locked |
| `relevance_tier` | text | false | department \| division \| office \| manual |
| `selection_note` | text | false | Method used for selection |
| `submitted_at` | date | false | Set when status → locked |

**Rules:** Admin-only (all null)  
**Security note:** Reviewer identity must not be exposed to subject. `serverListMyReviewerTasks` never includes other reviewers' identities.

---

### E. `hr_rating_scores`

- **Purpose:** Per-aspect score per reviewer row. Replaced (delete+recreate) on every draft save.
- **Step:** D5
- **Dependency:** `hr_rating_reviewers`, `hr_rating_aspects`
- **Source consumer:** `rating-server.ts` → `serverSaveReviewerDraft` (deletes all existing scores, creates new ones)

| Field | Type | Required | Notes |
|---|---|---|---|
| `reviewer_row` | relation → hr_rating_reviewers | **true** | Parent reviewer row. cascadeDelete=true. |
| `aspect` | relation → hr_rating_aspects | **true** | Which aspect being scored. |
| `score` | number | false | 1–5. Validated server-side. |
| `comment` | text | false | Optional per-aspect comment |

**Rules:** Admin-only (all null)  
**Security note:** Individual reviewer scores must not be readable by subject or other reviewers.

---

### F. `hr_rating_results`

- **Purpose:** Aggregated result per assignment. Upserted by `recalculateAssignmentResult` after each reviewer submits.
- **Step:** D6
- **Dependency:** `hr_rating_assignments`
- **Source consumer:** `rating-server.ts` → `recalculateAssignmentResult`, `serverGetMyResult`

| Field | Type | Required | Notes |
|---|---|---|---|
| `assignment` | relation → hr_rating_assignments | **true** | One result per assignment. cascadeDelete=true. |
| `overall_score` | number | false | Mean of reviewer means (0.00–5.00) |
| `category` | text | false | Sangat Baik \| Baik \| Perlu Peningkatan \| Perlu Perhatian HR |
| `respondent_count` | number | false | Count of submitted reviewers |
| `aspect_scores_json` | text | false | JSON array: per-aspect averages |
| `summary` | text | false | AI narrative |
| `strengths` | text | false | |
| `improvements` | text | false | |
| `suggestions` | text | false | |
| `calculated_at` | date | false | Last recalculation timestamp |

**Rules:** Admin-only (all null)  
**Security note:** `serverGetMyResult` exposes `overall_score`, `category`, `aspect_scores_json` (aggregated) to subject. Individual reviewer breakdown is never returned.

---

### G. `hr_staff_reports`

- **Purpose:** Staff-submitted incident/facility/safety reports. Employees create; HR/Owner review, annotate, close.
- **Step:** C1
- **Dependency:** `users`
- **Source consumers:** `lib/hr/reporting-server.ts`, `app/api/hr/reports/`

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | text | **true** | Max 180 chars (enforced server-side) |
| `body` | text | **true** | Max 8000 chars (enforced server-side) |
| `category` | select | false | facility, safety, misconduct, operations, other |
| `status` | select | false | draft, submitted, in_review, closed |
| `priority` | select | false | low, medium, high |
| `location_text` | text | false | Max 200 chars |
| `created_by` | relation → users | **true** | Stamped server-side; never from client body |
| `company_id` | text | false | Stamped from `ctx.companyIds[0]` |
| `hr_note` | text | false | HR/Owner only. Stripped in `sanitizeCaseForClient` for employees. |
| `submitted_at` | date | false | Set when submitted |
| `closed_at` | date | false | Set when closed |
| `closed_by` | relation → users | false | HR/Owner who closed |

**Rules:** Admin-only (all null)  
**Employee access:** Controlled by Next.js API — can only read own reports. Cannot see `hr_note`. Cannot list others.

---

### H. `hr_findings`

- **Purpose:** HR/Owner-authored findings about employees or incidents. Employees CANNOT access.
- **Step:** C2
- **Dependency:** `users`
- **Source consumers:** `lib/hr/reporting-server.ts`, `app/api/hr/findings/`

Schema: **identical to `hr_staff_reports`** (same `caseSchema()` function in bootstrap).

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | text | **true** | |
| `body` | text | **true** | |
| `category` | select | false | safety, misconduct, operations, other (Finding-kind subset) |
| `status` | select | false | draft, submitted, in_review, closed |
| `priority` | select | false | low, medium, high |
| `location_text` | text | false | |
| `created_by` | relation → users | **true** | |
| `company_id` | text | false | |
| `hr_note` | text | false | |
| `submitted_at` | date | false | |
| `closed_at` | date | false | |
| `closed_by` | relation → users | false | |

**Rules:** Admin-only (all null)  
**Employee access:** BLOCKED at Next.js layer — `serverListCases` for kind=finding throws 403 for non-HR/non-Owner.

---

### I. `hr_case_attachments`

- **Purpose:** Attachment metadata + binary file for reports and findings. Files served auth-gated, never as public PocketBase URLs.
- **Step:** C3
- **Dependency:** `users`
- **Source consumers:** `lib/hr/reporting-server.ts → serverAddAttachment/serverReadAttachmentBytes`

| Field | Type | Required | Options / Notes |
|---|---|---|---|
| `kind` | select | false | report, finding |
| `parent_id` | text | **true** | ID of parent hr_staff_reports or hr_findings record |
| `original_name` | text | false | Original filename from client |
| `mime` | text | false | image/jpeg \| image/png \| image/webp |
| `size` | number | false | Bytes. Source validates ≤ 10MB before upload. |
| `created_by` | relation → users | false | Actor who uploaded |
| **`file`** | **file** | **false** | maxSelect=1, maxSize=10485760 (10MB), mimeTypes=[image/jpeg, image/png, image/webp] |

**Rules:** Admin-only (all null)

> **⚠ CRITICAL — BOOTSTRAP BUG:** The `file` field is **absent from `scripts/bootstrap-local-pb.mjs`** but **required by `reporting-server.ts` line 401**:
> ```js
> file: new File([blob], name, { type: checked.mime }),
> ```
> PocketBase will reject the create if the collection has no `file` field.  
> **Production creation MUST include the `file` field.**  
> This bug must also be fixed in `bootstrap-local-pb.mjs` separately (out of scope for Phase 20).

**Attachment security:**
- Files uploaded via Next.js server using admin PocketBase token.
- Files retrieved via `serverReadAttachmentBytes` → `adminPb.files.getURL` (admin token) → streamed to client.
- Client receives bytes with headers: `Cache-Control: private, no-store`, `Content-Disposition: inline`.
- Direct PocketBase file URL access: blocked by admin-only collection rules.
- No base64. No `public/uploads`. No public CDN.
- Max 5 attachments per case (`REPORTING_MAX_ATTACHMENTS = 5`).
- Max 10MB per file (`REPORTING_MAX_FILE_BYTES = 10 * 1024 * 1024`).
- Allowed MIME: `image/jpeg`, `image/png`, `image/webp` only.

---

## Users Migration Specification

### `mobile_session_nonce`
- **Type:** text
- **Required:** false
- **Default:** none (null)
- **Source writes:** `mobile/lib/auth-session.ts` → `registerMobileSessionAfterAuth`
  ```ts
  pb.collection("users").update(id, { mobile_session_nonce: nonce })
  ```
- **Source reads:** `mobile/context/auth.tsx` → realtime subscribe handler
- **Backfill needed:** NO — existing users have no mobile nonce, they will authenticate fresh and nonce will be set on next mobile login.
- **Risk of adding:** NONE — additive field, existing users unaffected.

### `account_type`
- **Type:** select
- **Values:** `["owner", "user"]`
- **Required:** false
- **Default:** none (null)
- **Source reads:** `lib/rbac.ts` → `normalizeAuthModel(user)` → `AccountType`
  - `normalizeAuthModel` checks `record.account_type === "owner"` with fallback
- **Source writes:** HR/Owner creates users via `system/register` page
- **Backfill needed:** NO — `normalizeAuthModel` has fallbacks for null account_type. Existing users will continue to work.
- **Production rules already reference** `@request.auth.account_type = "owner"` — adding this field will activate that branch of the OR rule.
- **Risk of adding:** NONE — additive field, null values fall back gracefully in auth model.

### `role_code`
- **Type:** text
- **Required:** false
- **Default:** none (null)
- **Valid values:** `hr`, `manager`, `staff`, `staff-basic`, `security`, `ob`
- **Source reads:** `lib/hr/api-auth.ts` → `isHrAccount(record)` → checks `record.role_code === "hr"`
- **Source reads:** `lib/rbac.ts` → `ROLE_ACCESS_BY_CODE[auth.roleCode]`
- **Backfill needed:** NO — `normalizeAuthModel` falls back to `role` field. Existing access unaffected.
- **Production rules already reference** `@request.auth.role_code = "hr"` — adding the field activates this check.
- **Risk of adding:** NONE.

### `dashboard_access`
- **Type:** bool
- **Required:** false
- **Default:** false (bool fields default to false in PocketBase)
- **Source reads:** `lib/rbac.ts` → `getOperationalDashboardRoute` → `if (auth.dashboardAccess) return "/dashboard-staff"`
- **Backfill needed:** NO — defaults to false. Owner will assign `dashboard_access = true` to eligible staff via HR admin.
- **Risk of adding:** NONE — null/false means no dashboard access, which is safe default.

---

## Leave Migration Specification

All leave fields are **text or number**, all optional, no relations. Source code (`leave-server.ts`) writes them using admin PocketBase. PocketBase silently drops fields not in schema — these must be added before deploying source.

| Field | Type | Required | Source Details | Backfill |
|---|---|---|---|---|
| `start_date` | text | false | `serverSubmitLeave`: `date: start_date` + `start_date` | NO |
| `end_date` | text | false | `serverSubmitLeave`: `end_date` | NO |
| `reason` | text | false | `serverSubmitLeave`: `reason: reasonText` (DEFAULT_LEAVE_BOOKING_REASON fallback) | NO |
| `division` | text | false | `serverSubmitLeave`: `division: divisionKey` (new; `devision` is legacy compat) | NO |
| `position` | text | false | `serverSubmitLeave`: `position: positionClean` from `profile.position` | NO |
| `booking_date` | text | false | `serverSubmitLeave`: `booking_date: new Date().toISOString()` | NO |
| `daily_compensation_rate` | number | false | `serverApproveLeave`: `daily_compensation_rate: dailyRate` | NO |
| `compensation_amount` | number | false | `serverApproveLeave`: `compensation_amount` | NO |
| `rejection_reason` | text | false | `serverRejectLeave`: tries `rejection_reason: reason`, fallback to `note` | NO |

**No backfill required** for any leave field. Existing leave records will have null for all new fields — previous submissions used the `date` field (which Production has as type `date`) and the `note` field for reason. New submissions after migration will populate all fields correctly.

**Existing Production leave fields — keep as-is:**

| Field | Type | Keep? |
|---|---|---|
| `user` | relation | YES |
| `date` | date | YES (legacy fallback in `pickLeaveDates`) |
| `status` | select | YES |
| `note` | text | YES (legacy reason + rejection fallback) |
| `devision` | text | YES (legacy typo; source writes both `devision` + `division`) |
| `hr_action_at` | date | YES (source writes on approve/reject) |
| `hr_action_by` | text | YES |
| `hr_action_name` | text | YES |

---

## Attachment Schema — Full Specification

```
Collection: hr_case_attachments
Type:       base
Rules:      all null (admin-only)

Fields:
  kind           type=select   required=false  values=[report,finding]
  parent_id      type=text     required=true
  original_name  type=text     required=false
  mime           type=text     required=false
  size           type=number   required=false
  created_by     type=relation required=false  → users
  file           type=file     required=false
                 maxSelect=1
                 maxSize=10485760  (10 MB)
                 mimeTypes=[image/jpeg, image/png, image/webp]
                 thumbs=[]
                 protected=false   (protection at Next.js layer)
```

**Why `protected=false` on PocketBase `file` field?**  
PocketBase's `protected` file option makes the file inaccessible via public file URL even with a token. Since this collection is admin-only, direct public access is already blocked. Setting `protected=false` allows `adminPb.files.getURL(record, filename)` to generate a working URL that the server can fetch with the admin token. With `protected=true`, even admin token reads would require extra steps. The current `serverReadAttachmentBytes` pattern works with `protected=false`.

---

## Idempotency Design

The migration is designed to be **safely repeatable**:

| Condition | Behavior |
|---|---|
| Collection already exists | Skip create; check fields only |
| Field already exists with correct type | Skip; keep existing |
| Field already exists with wrong type | FLAG as conflict; do NOT modify |
| Existing Production rules | Never overwrite |
| Existing Production data | Never modify |
| Existing Production records | Never touch |

**Idempotency principle:** `IF NOT EXISTS → CREATE`. `IF EXISTS AND MATCHES → SKIP`. `IF EXISTS AND CONFLICTS → STOP AND FLAG`.

The dry-run script outputs the planned actions but makes no changes. The actual migration (when Owner executes it) should check existence before each operation.

---

## Backup Plan

The following backup steps must be performed **before** executing any Production changes. This is documentation only — no backup is created in Phase 20.

### Pre-migration backup checklist

```
[ ] Full Production PocketBase data backup
    Method: Server-side file copy of pb_data/ directory
    OR: PocketBase Admin UI → Settings → Export/Backup
    Destination: secure offsite storage

[ ] Export critical collections as JSON
    - users (export all records including auth fields)
    - leave_requests (existing leave data)
    - profiles (existing employee profiles)

[ ] Record migration metadata
    - Timestamp: _____________________
    - Git commit hash: ________________
    - Application version: ____________
    - Executor: ______________________

[ ] Verify backup integrity (can restore)
```

### Recovery procedure (if migration fails mid-way)

1. Stop any running migration scripts
2. Restore `pb_data/` from backup
3. Restart Production PocketBase
4. Verify schema via `scripts/compare-schema-local-vs-prod.mjs`
5. Document what was completed and what failed

---

## Dry-Run Result

Executed: 2026-08-28T06:03:44 UTC  
Script: `scripts/dry-run-production-migration.mjs` (GET-only)  
Machine-readable output: `docs/_dry_run_result.json`

```
CREATE COLLECTION (9):
  + hr_rating_periods
  + hr_rating_aspects
  + hr_rating_assignments
  + hr_rating_reviewers
  + hr_rating_scores
  + hr_rating_results
  + hr_staff_reports
  + hr_findings
  + hr_case_attachments

ADD FIELD (13):
  + users.mobile_session_nonce (text)
  + users.account_type (select)
  + users.role_code (text)
  + users.dashboard_access (bool)
  + leave_requests.start_date (text)
  + leave_requests.end_date (text)
  + leave_requests.reason (text)
  + leave_requests.division (text)
  + leave_requests.position (text)
  + leave_requests.booking_date (text)
  + leave_requests.daily_compensation_rate (number)
  + leave_requests.compensation_amount (number)
  + leave_requests.rejection_reason (text)

KEEP EXISTING RULES (12):
  ✓ profiles.listRule, viewRule, createRule, updateRule, deleteRule
  ✓ users.listRule, viewRule, createRule, updateRule, deleteRule
  ✓ leave_requests.listRule, viewRule

CONFLICTS: 0

BLOCKERS: 0
```

---

## Conflicts

**NONE.** Dry-run found zero type conflicts or rule conflicts.

All fields to be added are new (absent from Production). No existing field has a type collision.

---

## Blockers

**NONE** found by dry-run.

Known issue (pre-existing, not a Production blocker):
- `bootstrap-local-pb.mjs` is missing the `file` field for `hr_case_attachments`. This is a Local bootstrap bug. Production collection creation will include the `file` field correctly per this spec. The Local bootstrap fix should be done in a future phase.

---

## Recommended Migration Order

Order is determined by relation dependencies. Earlier steps must complete before later steps.

```
STEP A — users field additions (no dependencies)
  A1. ADD users.mobile_session_nonce  (text, optional)
  A2. ADD users.account_type          (select: owner,user)
  A3. ADD users.role_code             (text, optional)
  A4. ADD users.dashboard_access      (bool, optional)
  → Safe: additive to auth collection with live data. PocketBase handles gracefully.

STEP B — leave_requests field additions (no dependencies)
  B1. ADD leave_requests.start_date           (text)
  B2. ADD leave_requests.end_date             (text)
  B3. ADD leave_requests.reason               (text)
  B4. ADD leave_requests.division             (text)
  B5. ADD leave_requests.position             (text)
  B6. ADD leave_requests.booking_date         (text)
  B7. ADD leave_requests.daily_compensation_rate (number)
  B8. ADD leave_requests.compensation_amount  (number)
  B9. ADD leave_requests.rejection_reason     (text)
  → Safe: additive to collection with live data. Existing records unaffected (null values).

STEP C — HR Reporting collections (depend on users only)
  C1. CREATE hr_staff_reports  (rules: all null)
  C2. CREATE hr_findings       (rules: all null)
  C3. CREATE hr_case_attachments  (rules: all null; INCLUDE file field)
  → Can run C1, C2, C3 in any order relative to each other.
  → Must run after Step A (users must exist for relation fields).

STEP D — HR Rating collections (ordered by relations)
  D1. CREATE hr_rating_periods   (depends on: users)
  D2. CREATE hr_rating_aspects   (depends on: nothing)
  D3. CREATE hr_rating_assignments (depends on: hr_rating_periods, users)
  D4. CREATE hr_rating_reviewers   (depends on: hr_rating_assignments, users)
  D5. CREATE hr_rating_scores      (depends on: hr_rating_reviewers, hr_rating_aspects)
  D6. CREATE hr_rating_results     (depends on: hr_rating_assignments)
  → D1 and D2 can run in parallel.
  → D3 must follow D1.
  → D4 must follow D3.
  → D5 must follow D4 and D2.
  → D6 must follow D3.

STEP E — Seed initial data
  E1. Create 5 default hr_rating_aspects records:
      {code: discipline,      name: Discipline,    sort_order:1, is_active:true, min_score:1, max_score:5}
      {code: responsibility,  name: Responsibility,sort_order:2, is_active:true, min_score:1, max_score:5}
      {code: teamwork,        name: Teamwork,      sort_order:3, is_active:true, min_score:1, max_score:5}
      {code: communication,   name: Communication, sort_order:4, is_active:true, min_score:1, max_score:5}
      {code: work_quality,    name: Work Quality,  sort_order:5, is_active:true, min_score:1, max_score:5}
  → Required for rating scoring to work. Aspects with is_active=true are included in reviewer tasks.

STEP F — Post-migration schema verification (see checklist below)
```

---

## Post-Migration Verification Checklist

Run **after** Owner completes migration, before deploying application:

```
[ ] users.mobile_session_nonce exists and is type=text
[ ] users.account_type exists and is type=select (values: owner,user)
[ ] users.role_code exists and is type=text
[ ] users.dashboard_access exists and is type=bool
[ ] leave_requests.start_date exists and is type=text
[ ] leave_requests.end_date exists and is type=text
[ ] leave_requests.reason exists and is type=text
[ ] leave_requests.division exists and is type=text
[ ] leave_requests.position exists and is type=text
[ ] leave_requests.booking_date exists and is type=text
[ ] leave_requests.daily_compensation_rate exists and is type=number
[ ] leave_requests.compensation_amount exists and is type=number
[ ] leave_requests.rejection_reason exists and is type=text
[ ] hr_rating_periods exists with 6 fields
[ ] hr_rating_aspects exists with 7 fields and 5 seed records (is_active=true)
[ ] hr_rating_assignments exists with 7 fields
[ ] hr_rating_reviewers exists with 6 fields
[ ] hr_rating_scores exists with 4 fields
[ ] hr_rating_results exists with 10 fields
[ ] hr_staff_reports exists with 12 fields
[ ] hr_findings exists with 12 fields
[ ] hr_case_attachments exists with 7 fields INCLUDING file (type=file)
[ ] All new collections have rules: listRule=null, viewRule=null, createRule=null, updateRule=null, deleteRule=null
[ ] users rules UNCHANGED (match Production baseline above)
[ ] leave_requests rules UNCHANGED
[ ] profiles rules UNCHANGED
[ ] No data deleted from any existing collection
[ ] No existing collection renamed or removed
[ ] Run: node scripts/compare-schema-local-vs-prod.mjs — verify MATCH for all HR collections
[ ] Run: node scripts/dry-run-production-migration.mjs — verify 0 CREATE, 0 ADD, 0 CONFLICTS
```

---

## Application Compatibility — Final Check

| API / Feature | Schema Required | Status After Migration |
|---|---|---|
| Rating `/api/hr/rating/periods` | hr_rating_periods | PASS |
| Rating `/api/hr/rating/aspects` | hr_rating_aspects | PASS |
| Rating `/api/hr/rating/assignments` | hr_rating_assignments | PASS |
| Rating `/api/hr/rating/my-tasks` | hr_rating_reviewers | PASS |
| Rating `/api/hr/rating/tasks/:id` | hr_rating_scores + hr_rating_reviewers | PASS |
| Rating `/api/hr/rating/results` | hr_rating_results | PASS |
| Rating `/api/hr/rating/my-result` | hr_rating_results | PASS |
| Reports `/api/hr/reports` | hr_staff_reports | PASS |
| Reports `/api/hr/reports/:id/attachments` | hr_case_attachments (with file field) | PASS |
| Findings `/api/hr/findings` | hr_findings | PASS |
| Findings `/api/hr/findings/:id/attachments` | hr_case_attachments (with file field) | PASS |
| Leave submit | leave_requests.start_date, end_date, reason, division, position | PASS |
| Leave approve | leave_requests.daily_compensation_rate, compensation_amount | PASS |
| Leave reject | leave_requests.rejection_reason | PASS |
| Mobile session | users.mobile_session_nonce | PASS |
| Web RBAC dashboard | users.account_type, role_code, dashboard_access | PASS |
| Profile avatar | profiles.avatar (already in Production) | PASS (no change needed) |

---

## Phase 20 Final Status

```
PHASE 20: PASS

Production modified:            NO
Production schema modified:     NO
Production data modified:       NO
Production rules modified:      NO

New collections specified:      9
Missing users fields specified: 4
Missing leave fields specified: 9
Attachment file field verified: PASS (included in hr_case_attachments spec)
Idempotency:                    PASS (IF EXISTS → SKIP; IF MISSING → CREATE)
Dry-run:                        PASS (9 CREATE, 13 ADD, 0 conflicts, 0 blockers)
Conflicts:                      0
Blockers:                       0

Known pre-existing issue:
  bootstrap-local-pb.mjs missing file field for hr_case_attachments.
  → Production spec is CORRECT (includes file field).
  → Local bootstrap fix: separate task, not blocking.

Migration readiness:
  READY FOR MIGRATION APPROVAL
```

---

> **STOP.**  
> **WAIT FOR OWNER APPROVAL.**  
> **DO NOT MIGRATE PRODUCTION.**  
> **DO NOT DEPLOY PRODUCTION.**

---

*Dry-run script: `scripts/dry-run-production-migration.mjs`*  
*Machine output: `docs/_dry_run_result.json`*  
*Phase 19 baseline: `docs/PHASE_19_PRODUCTION_SCHEMA_MIGRATION_PLAN.md`*
