# PHASE 12 — HR Rating Staging Report

**Date:** 2026-08-13  
**Status:** Staging schema + API validation **PASS**  
**Production:** NOT modified · NOT deployed · `pb-erp` still online 15D / 0 restarts  
**Leave write-lock / Attendance GPS:** NOT modified in this phase

Owner decisions locked: D1=A, D2=all eligible active, D3=5 aspects, D4=lifecycle OK, D5=hybrid, D6=staging first, D7=soft anti-bias.

---

## 0. ECONNRESET diagnosis (Phase 12 continue)

### What the failing script requested

| Item | Value |
| --- | --- |
| Script | `scripts/pb-apply-hr-rating-schema-staging.mjs` |
| Target URL | `POCKETBASE_STAGING_URL` → **`http://127.0.0.1:8092` only** (staging-guard blocks prod hosts / 8091) |
| First failing call (pre-fix) | `POST /api/admins/auth-with-password` |
| Auth | Staging admin identity/password from `.env.staging.local` (`POCKETBASE_STAGING_ADMIN_*`) |
| Body | JSON `{ identity, password }` (small) |
| PB version | **0.22** — `/api/admins/auth-with-password` is correct |
| Production | Not targeted |

### Root cause

**Node undici `fetch` over an SSH local-forward (`ssh -L 8092:…`) reset the TCP stream on the admin-auth POST**, while short `GET /api/health` often still returned 200 (curl / IWR / even some Node GETs).

That is **not** “wrong URL / wrong method / wrong PB API / production target.” It is tunnel + keep-alive / connection-reuse fragility: health proved reachability; the schema script’s first real POST was the one that hit `ECONNRESET`.

When a clean forward was available, both undici and Node `http` succeeded — confirming the endpoint itself is healthy on staging.

### Exact fix

1. Added `scripts/lib/staging-http.mjs` — Node `http`/`https` with `agent: false`, `Connection: close`, IPv4 (`family: 4`), retries on `ECONNRESET` / refused / timeout.  
2. Rewired `pb-apply-hr-rating-schema-staging.mjs` (+ staging API test PB calls) to use `stagingJson` instead of undici `fetch`.  
3. Added `scripts/diag-staging-pb-http.mjs` for safe compare (health + admin-auth, no schema apply).  
4. Staging guards / staging-only admin credentials **unchanged** (no production credentials).

---

## 1. Architecture

```
Owner/HR (web /hr/rating)
  → POST /api/hr/rating/periods
  → POST /api/hr/rating/assignments  (smart_random | manual)
       → eligible pool (company ∩ relevance)
       → soft anti-bias previous period
       → hr_rating_reviewers rows

Reviewer (web staff + mobile Rating tab)
  → GET /api/hr/rating/my-tasks
  → PUT/POST /api/hr/rating/tasks/:id  (draft → submit → locked)

Subject (web + mobile)
  → GET /api/hr/rating/my-result   (aggregate only)

HR/Owner detail
  → GET /api/hr/rating/assignments/:id  (full drill-down + evidence)
```

All writes via Next.js + admin PocketBase. Collections use **null** rules (no direct user PB writes).

Model: **one subject → many reviewers**.

---

## 2. Staging schema result

Command: `npm run pb:hr-rating-schema:staging`  
Target confirmed: `http://127.0.0.1:8092` (not production).

| Collection | Result | Locked rules | Fields |
| --- | --- | --- | --- |
| `hr_rating_periods` | created | yes | 6 |
| `hr_rating_aspects` | created + 5 defaults seeded | yes | 7 |
| `hr_rating_assignments` | created | yes | 7 |
| `hr_rating_reviewers` | created | yes | 6 |
| `hr_rating_scores` | created | yes | 4 |
| `hr_rating_results` | created | yes | 10 |

**Verdict: PASS**

---

## 3. Authorization model

| Actor | Can |
| --- | --- |
| Owner | Manage periods/assignments; full detail; assign HR as subject |
| HR | Manage within company scope; **cannot** create assignment for self |
| Reviewer | Own tasks only; cannot see other reviewers |
| Subject | Aggregate result only; no identities/scores/comments |
| Unauthenticated | 401 |
| Direct PB user write | Denied (rules null) |

---

## 4. Smart Random algorithm

1. Exclude: subject, inactive, no company overlap, duplicates  
2. **Relevance required:** same company **AND** (same department **OR** same division **OR** same office)  
3. Same-company-only is **NOT** eligible (D1)  
4. Prefer stronger tiers: department → division → office  
5. Random within tier  
6. Soft anti-bias: prefer not previous closed-period reviewers when alternatives exist (D7)  
7. If eligible &lt; requested → **400** with message:  
   `Only N eligible reviewers were found. M reviewers were requested.`  

---

## 5. Privacy

- Subject API strips reviewer-level data  
- Reviewer tasks filtered by `reviewer = session user`  
- HR/Owner detail expands reviewer identities + raw scores  

---

## 6. Calculation & categories

- Per-reviewer mean of aspects → overall mean of reviewer means  
- Categories (cent-rounded):  
  - ≥4.50 Sangat Baik (Very Good)  
  - 4.00–4.49 Baik (Good)  
  - 3.00–3.99 Perlu Peningkatan (Needs Improvement)  
  - &lt;3.00 Perlu Perhatian HR (HR Attention)  

Unit matrix: **PASS=18 FAIL=0**

---

## 7. Staging API acceptance

Next: single instance `npm run staging:next-dev` on **:3001** → staging PB `:8092`.  
Command: `$env:BASE_URL='http://127.0.0.1:3001'; npm run test:hr-rating-api-staging`

**PASS=19 FAIL=0 WARN=0**

| Check | Result |
| --- | --- |
| Owner/HR create period | PASS |
| 1 subject → multiple reviewers (smart_random) | PASS |
| Insufficient eligible DENY (org scope) | PASS |
| No HR self-assignment | PASS |
| Subject cannot see reviewer identities | PASS |
| Reviewer sees only own tasks | PASS |
| Draft → submit → locked edit DENY | PASS |
| Employee assignment detail DENY | PASS |
| HR detail (reviewer identities) | PASS |
| Unauthorized 401 | PASS |
| Direct PB mutation DENY (null rules) | PASS |
| Category / calc / eligibility | Unit PASS |
| Mobile Rating tab / client API | Present (`mobile/.../rating.tsx`, `hr-rating-api.ts`) — compatible with same Next APIs |
| Leave production lock | Unchanged (docs/rules snapshots not modified; prod `pb-erp` not restarted) |
| Attendance/GPS | Unchanged this phase |

**WARN (non-blocking):** Full multi-reviewer complete → summary/suggestions end-to-end on one assignment was not expanded beyond single-reviewer submit + unit calc/summary coverage. Cross-company denial covered in unit eligibility filters.

---

## 8. Production confirmation

| Check | Result |
| --- | --- |
| Schema apply target | `127.0.0.1:8092` only |
| PM2 `pb-erp` (prod) | online, **15D** uptime, **0** restarts |
| PM2 `pb-erp-staging` | online, healthy `:8092` |
| Production schema / DNS / Nginx / 8091 | **not modified** |
| Deploy | **not done** |

---

## 9. Files changed (Phase 12 continue — transport fix)

- `scripts/lib/staging-http.mjs` (new)
- `scripts/diag-staging-pb-http.mjs` (new)
- `scripts/pb-apply-hr-rating-schema-staging.mjs` (use staging-http)
- `scripts/test-hr-rating-api-staging.mjs` (PB via staging-http)
- `docs/PHASE_12_RATING_REPORT.md` (this file)

---

## 10. Remaining / next

| # | Item | Severity |
| --- | --- | --- |
| 1 | Production rating schema apply | **Blocked** until explicit owner approval |
| 2 | Optional: re-run attendance staging regression | Low |
| 3 | Org data quality (dept/div/office filled) for real Smart Random | Medium |

**STOP** — no production schema/deploy without owner approval.

---

## Verdict

| Area | Result |
| --- | --- |
| ECONNRESET root cause | **Identified** (undici/fetch over flaky SSH tunnel on admin-auth POST) |
| Staging transport fix | **PASS** |
| Staging schema apply | **PASS** |
| Unit calc / Smart Random / categories | **PASS** (18/0) |
| Staging API matrix | **PASS** (19/0) |
| Production | **UNTOUCHED / NO-GO** |
