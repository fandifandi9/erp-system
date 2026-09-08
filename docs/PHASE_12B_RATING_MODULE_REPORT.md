# PHASE 12B — HR Rating Module Report

**Date:** 2026-08-13  
**Status:** Local implementation complete · Staging deploy follows  
**Production:** NOT modified · NOT deployed

---

## 1. Existing audit (before this phase)

| Area | Status |
| --- | --- |
| Collections `hr_rating_*` | Present on staging; locked rules |
| 1 subject → many reviewers | Already in server |
| Smart Random D1=A (company + dept/div/office) | Already; company-only excluded |
| Privacy (subject aggregate) | Already |
| HR/Owner detail | Already |
| HR as subject (Owner assigns) | Already |
| Categories / 5 aspects / 1–5 | Already |
| Summary/suggestions | Already |
| Audit events | Period/assignment/submit already |
| Official module pages | **Missing** — everything lived on one `/hr/rating` page |
| Sidebar SDM | **Missing** Rating item |
| Dashboard | Link only, not summary card |
| Respondents X/Y | **Missing** (showed raw count only) |
| Assignment preview | **Missing** |
| `/hr/rating/results` | **Missing** |
| `/hr/rating/periods` dedicated | **Missing** |

### Conflict (smallest/safest choice)

Phase 12 **D1=A** forbids company-only reviewers.  
Phase 12B prompt lists **Tier 4 = same company**.

**Kept D1=A.** Company-only remains ineligible. Fallback stays dept → division → office only. Eligible < requested still **400** (no silent reduce) with UI warning: *Reviewer tersedia hanya X orang dari Y yang diminta.*

---

## 2. Changes

- Official Rating module nav + pages
- Dashboard HR shortcut card (summary only)
- Assignment wizard with eligible preview
- Progress `requested / eligible / selected / completed` as **X / Y**
- Current vs final aggregate labels
- Preview API, dashboard API, results API
- SDM sidebar: Penilaian / Rating
- Mobile tab labels + respondents X/Y
- Unit tests expanded (24)

**Not changed:** Attendance GPS, Leave lock, Payroll, production PB.

---

## 3. UI module structure

| Path | Role |
| --- | --- |
| `/hr/rating` | Dashboard KPIs |
| `/hr/rating/periods` | Period lifecycle |
| `/hr/rating/assignments` | List + create wizard |
| `/hr/rating/assignments/[id]` | HR/Owner detail + tiers |
| `/hr/rating/results` | Results table |
| `/hr/rating/tasks` | Reviewer tasks |
| `/hr/rating/my-result` | Subject aggregate only |

---

## 4–8. Logic

Smart Random: company ∩ (dept OR div OR office), self/inactive/cross-company excluded, soft previous-period avoidance.  
Reviewer count = creator request. Insufficient → warning + deny create.  
Privacy: subject APIs strip reviewer identity. HR/Owner see names, tiers, raw scores.  
Score: server-side mean of reviewer means; incomplete = current aggregate.  
Progress: `Completed: 1 / 2`, `Respondents: 1 / 2`, status In Progress / Complete.

---

## 9. Mobile

Same Next APIs. Tab: Hasil Saya / Tugas Penilaian. Respondents X/Y when API provides it.

---

## 10. API

Existing `/api/hr/rating/*` retained. Added:

- `GET /api/hr/rating/preview`
- `GET /api/hr/rating/dashboard`
- `GET /api/hr/rating/results`

List/detail/my-result now include `progress`.

---

## 11. Schema

**No new collections.** Reuse Phase 12 `hr_rating_*`. Progress computed from reviewers + `selection_evidence_json`. Production schema untouched.

---

## 12. Tests

`npm run test:hr-rating-unit` → **PASS=24 FAIL=0**

Local `tsc`: Rating files clean after fixes. Unrelated dirty-tree errors remain (bisnis/retur, WMS) — **not fixed** (out of scope).

---

## 13. Staging result

Controlled overlay deploy to `/var/www/erp-staging` (not dirty WIP tree).  
Public: **https://staging.serba.space** · Next `127.0.0.1:3002` · PB `127.0.0.1:8092` via **https://pb-staging.serba.space**

`npm run test:hr-rating-api-staging` (BASE_URL public):

**PASS=20 FAIL=0 WARN=0**

Includes: period create, insufficient eligible warning (X of Y), smart random 2 reviewers, HR self-assign 403, subject privacy, reviewer own tasks, submit lock, employee detail 403, HR detail + **respondents 1 / 2**, unauthorized 401, leave/direct PB 403, production `pb-erp` still 16D / 0 restarts.

Pages HTTP 200: `/hr/rating`, `/hr/rating/periods`, `/login`.

---

## 14. Known issues

- Company-only Tier 4 not implemented (kept Phase 12 D1=A).
- Eligible < requested does not auto-create partial assignments (400 + warning).
- `/api/health` missing on this HEAD-based staging app (login 200 used as preflight).
- Local `tsc` still fails on unrelated dirty-tree files (bisnis/retur, WMS) — not modified.
- HR/Owner mobile extra screens not duplicated; same APIs.

---

## 15–16. Production readiness / safety

**NO-GO for production** until Owner UAT approval.

| Check | Result |
| --- | --- |
| Production PB :8091 | UNTOUCHED |
| PM2 `pb-erp` | online, 16D, 0 restarts |
| Leave lock | still 403 on direct PB create |
| Attendance GPS | not modified |
| Payroll | not modified |
