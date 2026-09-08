# PHASE 12 — Pre-Implementation Audit & Owner Decisions Required

**Date:** 2026-08-13  
**Status:** **STOPPED — awaiting owner decisions**  
**Rule:** Do not invent business rules. Large implementation blocked until decisions below are answered.

Audit evidence: [Explore HR schema for Rating](aa9d39f8-c242-48a7-8ab3-8cfba654e8ba)

---

## What already exists (reuse — no second master)

| Area | Reuse |
| --- | --- |
| Employee | `users` + `profiles` (`profiles.user`) |
| Org labels | `profiles.department`, `profiles.division`, `profiles.position` (text via `hr_employee_options`) |
| Company scope | `biz_company_profile` + `biz_user_companies` + `lib/hr/company-scope.ts` |
| RBAC | `account_type`, `role_code` (`lib/auth-model.ts`) |
| Inactive | `users.status` = `active` \| `inactive` |
| Server auth pattern | `/api/hr/*` + admin PB + `rejectClientPrivilegeFields` + `emitBusinessEventServer` |
| Audit | `biz_activity_events` |
| Leave write-lock | **DO NOT TOUCH** (`pb/rules/leave_requests*`) |
| Attendance/GPS | **DO NOT MODIFY** |

**No rating collections exist today.**

---

## Critical gap: Smart Random “relevance”

Schema **does not** have:

- `manager_id` / `supervisor_id` / `reports_to`
- subordinate / org-chart collection
- team / work-relationship collection
- `profiles.company` (company is only via `biz_user_companies`)

**Available weak signals only:**

1. Same company (`biz_user_companies` overlap)
2. Same `profiles.department` (text match)
3. Same `profiles.division` (text match)
4. Same `profiles.office_id`
5. `users.role_code` (RBAC label only — e.g. `"manager"` is **not** a reporting line)

Owner brief asked for priority like “direct manager → same dept → same division → same company”.  
**Direct manager cannot be implemented without new master data or an owner decision to drop that signal.**

---

## Proposed data model (draft — not created yet)

Follow existing naming (`hr_*` / server-owned writes):

| Collection | Purpose |
| --- | --- |
| `hr_rating_periods` | Period (name, dates, status, created_by, …) |
| `hr_rating_aspects` | Configurable aspects (discipline, teamwork, …) template |
| `hr_rating_assignments` | **One subject** in a period + reviewer_count + assignment_method |
| `hr_rating_reviewers` | Reviewers linked to assignment (selected set + evidence JSON) |
| `hr_rating_responses` | **Raw** per reviewer × aspect scores + comment; status draft/submitted |
| `hr_rating_results` | Calculated outputs only (overall, per-aspect, category, summary) — never replace raw |

Privacy:

- Subject APIs return **aggregate only**
- Reviewer APIs return **own tasks only**
- Owner/HR detail APIs return full drill-down
- HR as subject: same employee privacy (Owner creates assignment; HR cannot pick own reviewers)

---

## OWNER DECISIONS REQUIRED (answer before STEP 3+)

### D1 — Smart Random relevance (blocking)

Which eligible pool is accepted **without** inventing a manager field?

**Option A (recommended for v1):**  
Relevance tiers using **existing** data only:

1. Same company + same department (text)  
2. Same company + same division (text)  
3. Same company + same office  
4. Same company only (last resort within company scope)  

Random within the strongest non-empty tier. Never outside company. Never inactive/self/duplicates.

**Option B:**  
Add new master field `profiles.manager_user` (relation → users) first, then use manager/subordinate in Smart Random.  
(Requires schema change + HR data entry for all employees.)

**Option C:**  
Owner describes another relevance rule using only existing fields.

→ **Choose A / B / C (detail if C).**

---

### D2 — Who may be a reviewer?

Eligible reviewers are active users who pass relevance (D1) **and**:

**Option A:** Any active staff in company scope with a profile (including `role_code=hr`, excluding subject).  
**Option B:** Only `role_code` in {`staff`, `staff-basic`, `manager`} — exclude Owner accounts from reviewing.  
**Option C:** Custom allow-list of `role_code`.

Note: Owner brief says HR receives same rating treatment as employees and **must not select their own reviewers**. That is compatible with all options if assignment for HR-as-subject is Owner-only.

→ **Choose A / B / C.**

---

### D3 — Aspect catalog (v1 defaults)

Confirm default aspects (1–5 each + optional comment):

1. Discipline  
2. Responsibility  
3. Teamwork  
4. Communication  
5. Work Quality  

→ **OK as-is / change list.**

---

### D4 — Period status lifecycle

Proposed: `draft` → `open` → `in_progress` → `closed` | `cancelled`

→ **OK / change.**

---

### D5 — Where subjects see results (v1)

**Option A:** Web (`/hr/rating` self view or `/dashboard-staff/rating`) + mobile personal tile.  
**Option B:** Web only for v1.  
**Option C:** Mobile only for reviewer tasks; web for HR/Owner + subject result.

→ **Choose A / B / C.**

---

### D6 — Schema apply target for new collections

New PocketBase collections for rating:

**Option A:** Staging PB only first (SSH tunnel `:8092`), then production after acceptance.  
**Option B:** Document schema in repo + migration script; apply staging after your explicit “apply staging schema” approval in next message.

(Production apply always needs separate approval — Phase 12 does not deploy prod.)

→ **Choose A / B.**

---

### D7 — Anti-bias history window

When avoiding repeated reviewers for the same subject:

**Option A:** Prefer not reusing reviewers from the **immediately previous closed period** for that subject.  
**Option B:** Prefer not reusing from the **last N periods** (specify N).  
**Option C:** Soft preference only within current period (no cross-period history).

→ **Choose A / B / C.**

---

## Confirmed non-negotiables (already clear — no question)

- Model: **one subject → many reviewers**
- Smart Random default; Manual = explicit exception with `assignment_method`
- Insufficient pool: never silently fill with irrelevant people
- Raw responses preserved; calculations are outputs
- Category thresholds exactly as specified
- Subject privacy / reviewer privacy / server-side auth
- No payroll integration
- No Attendance/GPS / leave lock / production deploy changes

---

## Exact next step after your answers

1. Lock D1–D7  
2. Design final schema + API contract  
3. Implement server auth → calc → Smart Random → UIs → tests  
4. Staging validation  
5. `docs/PHASE_12_RATING_REPORT.md`  
6. **STOP — no production deploy**

---

**Please reply with D1–D7 choices.** Implementation resumes only after that.
