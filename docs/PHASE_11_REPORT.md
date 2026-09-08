# PHASE 11 REPORT — SDM + Absensi + Mobile Production Readiness

**Date:** 2026-08-12  
**Mode:** Implementation + staging validation (no production deploy, no production DB writes)  
**Checkpoint preserved:** Leave Security `fad420b7` — production leave rules **not** modified  

> **Superseded by:** [`docs/PHASE_11_PRODUCTION_READINESS.md`](./PHASE_11_PRODUCTION_READINESS.md)  
> Final staging matrix: **PASS=18 FAIL=0 WARN=0** (GO with deployment gates).

---

## 1. Current state

| Area | Status |
| --- | --- |
| SDM master (employee, dept/position via profile) | **Partial** — employee CRUD exists; dept/position from `hr_employee_options` + profile fields, no standalone master UI |
| Attendance (GPS check-in/out) | **Implemented** — logic in `lib/attendance.ts` + **new** server API Wave 3 |
| QR attendance | **Not implemented** — product design is **GPS + office profile**, not QR scan (see §11) |
| Web staff check-in | **By design disabled** — `NativeAttendanceOnlyNotice` |
| Mobile Expo app | **Primary channel** — GPS, optional selfie, offline queue (legacy direct PB) |
| PWA installable web | **Not present** — mobile is native Expo, not installable PWA |
| Attendance PB write-lock | **Not done** — `attendance_logs` still client-writable (same class of risk as leave pre-Wave 2) |
| Next.js production build | **WARN** — `npm run build` fails on unrelated WIP type error in `bisnis/retur/[id]/page.tsx` (outside Phase 11 scope) |

---

## 2. SDM status

| Capability | State | Evidence |
| --- | --- | --- |
| Employee list/detail/create | OK | `app/(dashboard)/hr/employees/*` |
| Department / Position | Partial | Dropdown from `lib/hr-employee-options.ts` + `profiles.department` / `position` on employee form |
| Division | Partial | `profiles.division` used by leave; options in `hr_employee_options` |
| Company / entity | OK | `biz_user_companies`, work-context, employee access |
| User ↔ profile | OK | `profiles.user` relation |
| Role / authorization | OK | `lib/auth-model.ts`, `lib/rbac.ts`, HR API auth contract |
| Incomplete profile tracking | OK | `hr/employees/incomplete` |

**Gap:** No dedicated Department/Position **master CRUD** module (acceptance doc P2). Options managed via PB collection `hr_employee_options` or defaults.

---

## 3. Attendance status

| Flow step | Implementation |
| --- | --- |
| Employee login | Mobile `login.tsx` → PocketBase auth |
| Office / GPS validation | `lib/attendance.ts` + server mirror in `lib/hr/attendance-server.ts` |
| Check-in | **API:** `POST /api/hr/attendance/check-in` (session identity, server GPS rules) |
| Check-out | **API:** `POST /api/hr/attendance/check-out` |
| Duplicate check-in/out | App + server (`getTodayAttendanceAdmin`) |
| Approved leave blocks check-in | Server + client |
| Selfie when HR requires | Multipart API + mobile FormData |
| HR view / filter / export | `hr/attendance/page.tsx` (client PB); **new** `GET /api/hr/attendance` with company scope |
| Manual HR correction | **Not found** as dedicated feature — no new business rule added |

**Design note:** Attendance is **GPS-radius based** against `profiles.office_id` → `offices.lat/lng/radius`, not QR-at-office.

---

## 4. Mobile / PWA status

| Item | Status |
| --- | --- |
| Native Expo app (`com.erp.staff`) | OK — camera + location permissions in `mobile/app.json` |
| Attendance tab | `mobile/app/(tabs)/attendance.tsx` + `AttendanceCheckInPanel` |
| API path for mutations | **Updated** — uses `EXPO_PUBLIC_ERP_WEB_URL` + `/api/hr/attendance/*` when configured |
| Offline queue | **WARN** — still replays via **direct PocketBase** (`offline-queue/processor.ts`), not API |
| PWA manifest / service worker | **Missing** — not an installable web PWA; native app is the target |
| Web responsive attendance | N/A — web shows mobile-only notice |

---

## 5. Security status

| Control | Before Phase 11 | After Phase 11 |
| --- | --- | --- |
| Check-in/out via Next API + admin PB | No | **Yes** (when mobile uses ERP URL) |
| Client `user` / status forge rejected | N/A | **Yes** — `rejectClientAttendanceForgeFields` |
| Identity from session only | Partial (leave only) | **Yes** for attendance API |
| HR list company scope | No (client list all users) | **Yes** on `GET /api/hr/attendance` |
| Inactive user denied | Client only | **Server** `assertUserActive` |
| `attendance_logs` PB direct write | Open | **Still open** — write-lock not in scope (like leave Wave 2B follow-up) |
| Offline replay forge risk | Open | **Still open** |
| QR anti-spoof | N/A (no QR) | N/A |

Production leave rules: **unchanged** (verified Phase 8–9; not re-opened).

---

## 6. Tests

| # | Test | Result | Notes |
| --- | --- | --- | --- |
| 1 | Employee check-in PASS | **WARN** | Staging admin auth failed (HTTP 400) — cleanup/setup blocked; smoke API tests not completed |
| 2 | Employee check-out PASS | WARN | Same blocker |
| 3 | Duplicate check-in DENY | WARN | Same blocker |
| 4 | Duplicate check-out DENY | WARN | Same blocker |
| 5 | Unauthorized DENY | WARN | Same blocker |
| 6 | Attendance tampering DENY | WARN | Same blocker |
| 7 | HR read attendance PASS | WARN | Same blocker |
| 8 | Cross-company DENY | WARN | Same blocker |
| 9 | Mobile QR flow PASS | **N/A** | QR check-in **not in product** (GPS design) |
| 10 | Production health check | **PASS** | `GET /api/health` on staging Next `:3001` → 200; staging PB tunnel `:8092` → 200 |

**Staging run attempted (2026-08-12):** Next dev on `:3001` with `NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8092` started successfully. Preflight health **PASS**. Test script halted at staging admin login (`/api/admins/auth-with-password` → 400). Likely cause: `POCKETBASE_ADMIN_*` in `.env.local` does not match admin on restored staging clone, or dedicated `POCKETBASE_STAGING_ADMIN_*` not set in `.env.staging.local`.

**Operator fix then re-run:**

```bash
# .env.staging.local (gitignored) — staging-only admin after restore drill
POCKETBASE_STAGING_URL=http://127.0.0.1:8092
POCKETBASE_STAGING_ADMIN_EMAIL=<staging-admin>
POCKETBASE_STAGING_ADMIN_PASSWORD=<staging-password>
SMOKE_PASSWORD=<smoke-user-password>

# Terminal 1: SSH tunnel
ssh -L 8092:127.0.0.1:8092 root@<vps>

# Terminal 2: Next staging (stop other next dev first — Next 16 single-instance lock)
$env:NEXT_PUBLIC_POCKETBASE_URL='http://127.0.0.1:8092'
npm run dev -- -p 3001

# Terminal 3:
$env:POCKETBASE_STAGING_URL='http://127.0.0.1:8092'
$env:BASE_URL='http://127.0.0.1:3001'
npm run test:hr-attendance-api-staging
```

---

## 7. Bugs fixed (technical, in scope)

1. **Attendance mutations bypassed server authorization** — added Wave 3 API + `attendance-server.ts`.
2. **Mobile always wrote directly to PocketBase** — now prefers ERP API when `EXPO_PUBLIC_ERP_WEB_URL` set.
3. **HR attendance API had no company scope** — `serverListAttendanceForHr` filters by `biz_user_companies`.
4. **Inactive users could check in if PB rules allow** — server checks `users.status`.
5. **Client could send forged `user` / `status` in body** — rejected on API routes.
6. **Missing `enqueueOfflineItem` import** after mobile refactor — restored.
7. **Staging guard blocked localhost tunnel** when `NEXT_PUBLIC_POCKETBASE_URL` equals `POCKETBASE_STAGING_URL` on `127.0.0.1:8092` — allow safe tunnel exception in `staging-guard.mjs`.

---

## 8. Files changed (Phase 11 scope only)

| File | Change |
| --- | --- |
| `lib/hr/attendance-server.ts` | **New** — server check-in/out/list |
| `app/api/hr/attendance/check-in/route.ts` | **New** |
| `app/api/hr/attendance/check-out/route.ts` | **New** |
| `app/api/hr/attendance/today/route.ts` | **New** |
| `app/api/hr/attendance/route.ts` | **New** — HR list |
| `mobile/lib/hr-attendance-api.ts` | **New** |
| `mobile/lib/attendance.ts` | API-first check-in/out |
| `scripts/test-hr-attendance-api-staging.mjs` | **New** |
| `package.json` | `test:hr-attendance-api-staging` script |
| `lib/hr/SERVER_AUTHORIZATION_CONTRACT.md` | Document Wave 3 attendance |
| `scripts/lib/staging-guard.mjs` | Allow `127.0.0.1:8092` tunnel equality |

**Not committed** — per instructions; WIP tree (~415 paths) untouched.

---

## 9. Database / schema changes

**None.** No PocketBase migrations, no production/staging schema edits, no rule changes.

---

## 10. Production blockers (before staff rollout)

| # | Blocker | Severity |
| --- | --- | --- |
| 1 | Run staging API test matrix **PASS** on `:3001` | High — blocked on staging admin credentials (400) |
| 2 | Deploy Next.js build with new `/api/hr/attendance/*` routes | High |
| 3 | Mobile build with `EXPO_PUBLIC_ERP_WEB_URL` pointing to production ERP | High |
| 4 | Smoke employees need **office_id** + active office with lat/lng (like leave fixtures) | High |
| 5 | `attendance_logs` PB write-lock (optional hardening wave) | Medium |
| 6 | Offline queue → API sync (or disable offline attendance) | Medium |
| 7 | HR attendance UI still uses client PB for reads — migrate to scoped API optional | Low |

---

## 11. Business decisions required from owner

| # | Decision | Why |
| --- | --- | --- |
| **B1** | **QR vs GPS** for attendance | User story mentions QR; **current product is GPS-only**. Add QR (office static QR + server nonce) or accept GPS-only? |
| **B2** | **Offline attendance** | Queue exists but **not safe** for production (direct PB replay). Disable offline, or fund API-backed sync + idempotency? |
| **B3** | **Manual attendance correction** | HR correction/adjustment UI not evident — needed for ops? |
| **B4** | **Department/Position master** | Dedicated CRUD vs current dropdown + `hr_employee_options`? |
| **B5** | **Web PWA** vs **native app only** | No PWA today; confirm native Expo as sole staff channel? |
| **B6** | **Staging admin after Phase 10 restore** | Staging clone uses prod admin; create dedicated staging admin for future drills? |

---

## 12. Exact next step

1. **Operator:** Set `POCKETBASE_STAGING_ADMIN_*` in `.env.staging.local` (credentials valid on restored staging PB), then re-run `npm run test:hr-attendance-api-staging` until **PASS**.
2. **Verify smoke employees** on staging (post-restore) have `office_id` + division/position if needed for ops gates.  
3. **Owner:** Decide **B1 (QR)** and **B2 (offline)** before production staff rollout.  
4. **Deploy** Next + mobile to production **only after explicit approval** — not done in Phase 11.  
5. **Optional Phase 11B:** `attendance_logs` write-lock (staging first, same pattern as leave).

---

**Phase 11 STOP** — no production deploy, no production DB changes, leave checkpoint intact.
