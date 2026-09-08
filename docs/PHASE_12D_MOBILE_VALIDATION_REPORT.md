# PHASE 12D — Mobile Final Validation Report

**Date:** 2026-08-14  
**Scope:** Mobile HR Attendance + Rating against **staging only**  
**Production:** NOT deployed · NOT modified · schema/PB/Leave/Attendance logic/Rating business logic **not changed** in this phase  

**Method:**  
- Static review of `mobile/` (screens, env, GPS, auth, API clients).  
- Live calls using the **same paths the mobile app uses** (`EXPO_PUBLIC_ERP_WEB_URL` → Next API, PocketBase auth on staging).  
- **No physical device / Expo runtime.** GPS permission dialog, layout on a phone, and keyboard overlap were **not** observed on hardware.

**Intended staging targets for this validation:**

| Role | URL |
| --- | --- |
| ERP (mobile API) | `https://staging.serba.space` |
| PocketBase staging | `https://pb-staging.serba.space` |

---

## 1. Mobile environment

| Item | Observed | Result |
| --- | --- | --- |
| `mobile/.env` | **Missing** (only `mobile/.env.example`) | **FAIL** for staging run |
| `mobile/.env.example` | `EXPO_PUBLIC_POCKETBASE_URL=https://pb.serba.space` · `EXPO_PUBLIC_ERP_WEB_URL=https://serba.space` | Production, not staging |
| `mobile/eas.json` `build.base.env` | Same production URLs (`pb.serba.space` / `serba.space`) | Production APK config; **no staging profile** |
| Code fallback | `mobile/lib/pocketbase.ts`: `getPocketBaseUrl() \|\| "http://127.0.0.1:8090"` | **FAIL** — localhost in shipped source |
| Live tests this phase | Forced `https://staging.serba.space` + `https://pb-staging.serba.space` | Staging used for API simulation |
| Expo on device | Not launched | UI/GPS permission **NOT RUN** |

Default Expo/EAS config does **not** point at staging. A developer who runs mobile without env hits **localhost:8090**. An EAS APK from `base` hits **production**.

---

## 2. Attendance mobile test matrix

Live client = employee token + `POST/GET https://staging.serba.space/api/hr/attendance/*` (same as `mobile/lib/hr-attendance-api.ts`). UI today-status uses PocketBase `attendance_logs` read (`mobile/lib/attendance.ts` `getTodayAttendance`), not `/today`.

Smoke employee **profile.office_id is empty**. Staging has active offices with lat/lng, but this user is not linked. Server then returns: *Data kantor tidak lengkap untuk validasi lokasi.*

| # | Test | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Login employee | **PASS** | `auth-with-password` on pb-staging HTTP 200 |
| 2 | GPS permission | **WARN** | Code requests `Location.requestForegroundPermissionsAsync`; iOS/Android usage strings present. **Not run on device.** |
| 3 | Check-in | **FAIL** | HTTP 400 *Data kantor tidak lengkap untuk validasi lokasi.* |
| 4 | GPS validation | **FAIL** | Happy-path radius check never reached (office link missing) |
| 5 | Check-out | **FAIL** | HTTP 400 *Belum ada absen masuk hari ini.* (cascade from #3) |
| 6 | Today attendance | **PASS** | `GET /api/hr/attendance/today` HTTP 200 `ok=true`; PB list HTTP 200 |
| 7 | Attendance history | **FAIL** | No history screen on Absensi. Only “Status Hari Ini”. Employee `GET /api/hr/attendance` = **403** |
| 8 | Duplicate check-in | **FAIL** | HTTP 400 same office-incomplete message — **not** *Sudah absen masuk hari ini.* Not counted as duplicate deny |
| 9 | GPS out-of-range | **FAIL** | Far coords still office-incomplete — **not** *Di luar zona absensi* |
| 10 | GPS tampering | **PASS** | Body `user` → HTTP 400 *Field 'user' tidak boleh dikirim oleh klien.* |
| 11 | Leave block | **PASS** | Temporary approved leave (admin fixture, then deleted): HTTP 400 *Anda sedang cuti disetujui hari ini.* |
| 12 | Unauthorized | **PASS** | No token → HTTP 401 |
| 13 | HR correction | **N/A** | Not in mobile flow. Web API exists; mobile has no correct UI |

**GPS still required in code + server** (`gpsRequired` default true; missing coords would be *Koordinat GPS wajib* **after** office is valid). QR is not used for HR attendance (QR is inventory/WMS only). Offline attendance remains **OFF** (`processAttendanceCheckIn` throws; check-in does not queue PB replay).

---

## 3. Rating mobile test matrix

Live client = same routes as `mobile/lib/hr-rating-api.ts`. Device UI **not** opened.

### Reviewer (`smoke-warehouse`)

| # | Test | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Login | **PASS** | pb-staging HTTP 200 |
| 2 | Open Rating menu | **WARN** | Tab `rating` exists in `mobile/app/(tabs)/_layout.tsx`. Not tapped on device |
| 3 | List tasks | **PASS** | `GET /api/hr/rating/my-tasks` HTTP 200, items=6 |
| 4 | Open assignment/task | **PASS** | `GET /api/hr/rating/tasks/:id` HTTP 200 |
| 5 | See 5 aspects | **PASS** | Discipline, Responsibility, Teamwork, Communication, Work Quality |
| 6 | Score 1–5 | **PASS** | Draft PUT HTTP 200; score 9 → HTTP 400 *Skor harus 1–5.* |
| 7 | Comment | **PASS** | Draft included comment; HTTP 200 |
| 8 | Submit | **PASS** | POST `action=submit` HTTP 200, `status=locked` |
| 9 | Task completed | **WARN** | Status becomes **`locked`**, not UI word “completed”. Resubmit HTTP 400. Mobile shows raw `t.status` |

### Subject (`smoke-employee`)

| # | Test | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Login | **PASS** | pb-staging HTTP 200 |
| 2 | Open Rating | **WARN** | Screen exists; not opened on device |
| 3 | Hasil Saya | **PASS** (API) | `GET /api/hr/rating/my-result` HTTP 200 `data.result` present |
| 4 | Aggregate score | **PASS** | `overall_score=3.5` after submit |
| 5 | Category | **PASS** | `Perlu Peningkatan` |
| 6 | Summary / suggestion | **PASS** | `summary`, `strengths`, `improvements`, `suggestions` present |
| 7 | Progress / respondents | **PASS** | `respondents_label=2 / 2`, `aggregate_kind` present |
| 8 | Reviewer identity hidden | **PASS** | Warehouse reviewer id **not** in payload. See §8 |

### HR / Owner on mobile

| # | Test | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Login HR | **PASS** | pb-staging HTTP 200 |
| 2 | Open Rating | **WARN** | Same staff tabs only (Hasil Saya / Tugas). **No** periods/assignments admin on mobile |
| 3 | RBAC | **PASS** | Employee `GET /api/hr/rating/assignments` **403**; `GET /dashboard` **403**. HR dashboard **200** |
| 4 | No privilege escalation | **PASS** | Subject cannot `GET` reviewer task (**403**) |

---

## 4. API target

| Client | Path | Staging live |
| --- | --- | --- |
| Auth | `POST {PB}/api/collections/users/auth-with-password` | pb-staging |
| Attendance mutations | `{ERP}/api/hr/attendance/check-in` · `check-out` | staging.serba.space |
| Attendance today (API helper) | `{ERP}/api/hr/attendance/today` | Used in live test; **UI uses PB read** |
| Rating | `{ERP}/api/hr/rating/my-tasks` · `my-result` · `tasks/:id` | staging.serba.space |
| Production ERP / `:8091` / `pb.serba.space` | Not used in live tests | — |

Shipped config still **defaults to production or localhost**, not staging.

---

## 5. Authentication

| Check | Result |
| --- | --- |
| Employee / HR / warehouse login on staging PB | **PASS** |
| API calls with `Authorization: Bearer <pb token>` | **PASS** |
| Unauthenticated attendance check-in | **401 PASS** |
| Unauthenticated rating tasks | **401 PASS** |
| Password stored on device | **PASS** (code) — SecureStore keeps PB auth JSON (`token` + model) and session nonce, **not** the password |
| Login UI | Password kept in React state only during the form (`mobile/app/(auth)/login.tsx`) |

---

## 6. GPS

| Check | Result |
| --- | --- |
| GPS mandatory in mobile check-in when geo enforced | **PASS** (code): `getCurrentLocation()` + `validateGPSRadius` + server `enforceGeo` |
| QR for HR attendance | **PASS** — not used |
| Offline attendance | **PASS** — disabled; errors tell user to retry online via ERP API |
| Device permission prompt | **WARN** — not run on device |
| Staging smoke employee can actually check in | **FAIL** — `office_id` empty → office-incomplete before radius math |
| Out-of-range message proven live | **FAIL** — blocked by office fixture |

---

## 7. Rating submission

| Check | Result |
| --- | --- |
| Draft + submit via server API | **PASS** |
| All 5 aspects required | **PASS** (server) |
| Score 1–5 enforced server-side | **PASS** |
| Submit locks task | **PASS** (`locked`) |
| Mobile form | **WARN** — free-text `number-pad`, default `"3"`, no 1–5 stepper; no submit loading state; task title is truncated id (`Tugas {id.slice(0,8)}`), not employee name |

---

## 8. Privacy

| Check | Result |
| --- | --- |
| Subject payload has no reviewer user id | **PASS** |
| Subject payload has no `reviewer_row` | **PASS** |
| Subject cannot open reviewer task | **PASS** (403) |
| Reviewer list is own tasks only | **PASS** (API filter `reviewer=self`) |
| `period.created_by` (HR id) in my-result | **WARN** — not a reviewer identity, but a staff id is still in the JSON the mobile client receives. Screen does not render it |

Mobile Hasil Saya copy includes *Identitas reviewer tidak ditampilkan.* Aggregate fields only are rendered.

---

## 9. ID / EN

| Surface | Result |
| --- | --- |
| Web Rating i18n (`hr-id` / `hr-en`) | Not wired on mobile |
| Mobile Rating screen | **FAIL** for bilingual consistency — hardcoded mix: *Hasil Saya*, *Tugas Penilaian*, *Respondents*, *Strengths*, *Improvement*, *Suggestion*, *Current aggregate*, aspect names in English |
| Attendance screen | Mostly ID |
| Technical strings | **FAIL**: *EXPO_PUBLIC_ERP_WEB_URL belum diset*; unreachable helper can mention *PocketBase* (`mobile/lib/errors.ts`) |

---

## 10. UI / UX

**Not verified on a phone.** Static review only.

| Item | Result |
| --- | --- |
| Layout clipped | **NOT RUN** |
| Buttons tappable | **WARN** — attendance buttons `minHeight: 52`; rating submit padding 12. Untested on device |
| Score form | **WARN** — raw TextInput, easy to type 0/6/empty (`Number("")===0` → server 400) |
| Keyboard covering comments | **WARN** — Rating has **no** `KeyboardAvoidingView` (login/profile/HR queues do) |
| Loading | **WARN** — initial spinner yes; submit has no busy flag |
| Error / empty | **PASS** (code) — inline error on attendance; Rating empty *Belum ada hasil* / *Tidak ada tugas* |
| Device run | **FAIL** as a validation gap — Owner asked to ensure the app is actually usable |

---

## 11. Security

| Check | Result | Evidence |
| --- | --- | --- |
| Rating mutations via Next API | **PASS** | PUT/POST `/api/hr/rating/tasks/:id` |
| Direct PB Rating write | **PASS** | User POST `hr_rating_scores` HTTP **403** |
| Attendance mutations via Next API (app code) | **PASS** | `mobileCheckIn` / `mobileCheckOut` |
| Direct PB `attendance_logs` create | **FAIL** | `createRule` allows `user = @request.auth.id`. Live POST as employee **HTTP 200, record created** (deleted after probe) |
| Authenticated APIs | **PASS** | 401 without token |
| RBAC | **PASS** | Employee denied HR rating admin routes |
| Password at rest | **PASS** (code) | Not in SecureStore |
| Reviewer ids in subject API | **PASS** | See §8 |
| Localhost fallback in app | **FAIL** | `http://127.0.0.1:8090` if env empty |

Mobile **app code** does not write Rating or Attendance to PB on check-in. Staging **PB rules still allow** staff to create their own `attendance_logs`. A modified client can bypass GPS/API.

---

## 12. Failures

1. **Check-in / check-out / duplicate / out-of-range** — smoke employee has no `office_id`; GPS radius never runs.  
2. **Attendance history** — no mobile screen.  
3. **Direct PB attendance create allowed** on staging (`createRule` not null).  
4. **No staging mobile env**; example + EAS `base` are production; source fallback is localhost.  
5. **Rating ID/EN** mixed; technical env-var error string.  
6. **Physical device / Expo UI not executed** (layout, GPS permission dialog, keyboard).  
7. Duplicate and out-of-range were **not** proven with the required messages (office error first).

---

## 13. Warnings (blocker?)

| Warning | Blocker for production mobile? |
| --- | --- |
| GPS permission / layout / keyboard not run on device | **Yes** — usability not demonstrated |
| Rating status `locked` vs “completed” | No — functionally submitted |
| Task list shows truncated id, not subject name | Usability, not security |
| HR/Owner Rating admin is web-only | No, if Owner accepts web for HR |
| `period.created_by` in my-result JSON | No for reviewer privacy; minor metadata |
| No `KeyboardAvoidingView` on Rating | Likely yes for comment UX on small phones |
| Score field is free text | Medium — server still rejects invalid scores |
| Attendance today UI reads PB, writes ERP | No if listRule stays own-rows-only |

---

## 14. Production readiness

**Production was not deployed. Production PB / schema / Leave lock / Attendance logic / Rating algorithm were not changed.**

| Gate | Result |
| --- | --- |
| Staging ERP/PB used for live API | Yes (this report) |
| Mobile default config = staging | **No** |
| Attendance GPS usable for smoke employee on staging | **No** |
| Rating reviewer submit via mobile API contract | **Yes** |
| Rating subject aggregate + no reviewer ids | **Yes** |
| No direct PB write possible | **No** (attendance_logs create still open) |
| Device UAT | **No** |

### Final gate

Rating API contract for mobile is largely green. Attendance cannot complete check-in for the staging smoke employee, PB still accepts direct attendance creates, shipped env is production/localhost, and no device UAT was performed.

**MOBILE: NO-GO**

Owner approval for production should wait until at least:

1. Staging (and later production) mobile env points at the intended ERP/PB — **no** `127.0.0.1` fallback in a release build.  
2. Employees who must check in have a valid active office with coordinates.  
3. Duplicate + out-of-range proven with the real GPS messages.  
4. Direct `attendance_logs` client create is denied (API-only), without loosening Leave lock.  
5. A real device pass of Absensi + Rating (permission, keyboard, tabs).  
6. Rating copy ID/EN cleaned (no env-var / PocketBase strings in user UI).

---

*End of Phase 12D report. Stopped here. No production deploy.*
