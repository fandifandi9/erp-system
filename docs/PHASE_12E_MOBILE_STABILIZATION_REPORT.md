# PHASE 12E — Mobile Stabilization Report

**Date:** 2026-08-14  
**Production:** NOT deployed · `erp-system` / `pb-erp` still **17D / 0 restarts**  
**Leave lock (`fad420b7`):** not opened  
**Rating business logic (12B):** not changed (`rating-server` / smart-random / calc / progress unchanged)

---

## A. Audit (before coding)

| Item | Location |
| --- | --- |
| Environment | `mobile/.env.example`, `mobile/eas.json` `build.*.env`, `mobile/app.config.js`, `mobile/lib/env.ts`, `mobile/lib/inventory/env.ts` |
| Localhost fallback | `mobile/lib/pocketbase.ts` was `getPocketBaseUrl() \|\| "http://127.0.0.1:8090"` |
| Direct PB attendance **write** | Mobile check-in/out already used Next API. Staging PB `attendance_logs.createRule` still allowed `user = @request.auth.id` (live POST **200** in 12D) |
| Direct PB attendance **read** | `mobile/lib/attendance.ts` `getTodayAttendance` / GPS-jump list |
| Attendance API | `mobile/lib/hr-attendance-api.ts` → `/api/hr/attendance/check-in\|check-out\|today` |
| Rating API | `mobile/lib/hr-rating-api.ts` → `/api/hr/rating/my-tasks\|my-result\|tasks/:id` |
| Mobile i18n | **None** (web `lib/i18n/messages/hr-id.ts` + `hr-en.ts` only) |
| Attendance history | **Missing** on mobile. `GET /api/hr/attendance` is HR-only (employee **403**) |
| GPS permission | `mobile/lib/location.ts` `requestForegroundPermissionsAsync`; `app.json` location plugin |

---

## B. Environment

| Profile | ERP | PocketBase |
| --- | --- | --- |
| Development (`eas.json` `development`) | `http://localhost:3000` | set in local `.env` (not baked; **no** `:8090` fallback) |
| Staging (`eas.json` `staging` / `preview`) | `https://staging.serba.space` | `https://pb-staging.serba.space` |
| Production (`eas.json` `production`) | `https://serba.space` (existing) | `https://pb.serba.space` (existing) |

`mobile/.env.example` defaults to **staging** for UAT. Production URLs are commented.  
Release builds: empty or loopback URL → fail-fast `"ERP server URL belum dikonfigurasi."`  
`127.0.0.1:8090` fallback **removed**.

**Result: PASS (config files)** — Expo was not run on a device.

---

## C. Attendance fixture (staging only)

Script: `npm run seed:hr-attendance-office-staging`

Smoke employee linked to an active office with lat/lng/radius. Verified by GET after PATCH.

**Caveat:** `test:hr-rating-api-staging` still PATCHes `office_id: ""` for D1 pool alignment. Re-run the office seed **after** rating API tests.

**Result: PASS** (when seed is applied)

---

## D. Attendance API-only security

Script: `npm run pb:attendance-write-lock:staging`  
Staging `attendance_logs`: `createRule/updateRule/deleteRule = null`. List/view unchanged (own or HR/Owner).

Live: employee POST collection `attendance_logs` → **HTTP 403**.

Production PB **not** patched.

**Result: PASS** (staging)

---

## E. Attendance test matrix

Live against `https://staging.serba.space` after office fixture, **before** the later staging Next crash:

| Test | Result | Evidence |
| --- | --- | --- |
| A Check-in inside radius | **PASS** | HTTP 200, id returned, “Dalam radius kantor (0 m…)” |
| B Check-out | **FAIL** | HTTP 400 *Belum ada absen masuk hari ini.* (today lookup vs PB `date` datetime) |
| C Duplicate check-in | **FAIL** | HTTP 200 second check-in (same lookup miss) |
| D GPS out-of-range | **PASS** | *Di luar zona absensi (11852210 m … radius 100 m)* |
| E Tampered user | **PASS** | HTTP 400 |
| F Unauthenticated | **PASS** | HTTP 401 |
| G Leave block | **PASS** | *Anda sedang cuti disetujui hari ini.* |
| H Inactive user | **PASS** | HTTP 403 |
| I Cross-company | **WARN** | Warehouse check-in 400 (setup) |
| J HR correction + audit | **PASS** | 403 employee / 400 no reason / 200 HR + `hr.attendance.corrected` |

Lookup fix added in `getTodayAttendanceAdmin` (date `~` YYYY-MM-DD). File copied to staging tree; **running process later crashed** so this fix is **not confirmed live**.

---

## F. Attendance history

- New `GET /api/hr/attendance/history` (own rows, Bearer auth).  
- Mobile tab **Hari Ini / Riwayat** via that API (no PB write/read for history).  
- Empty copy ID/EN: *Belum ada riwayat absensi.* / *No attendance history yet.*  
- Staging build included `ƒ /api/hr/attendance/history`.  
- After overlay restart, history was **404** (old process) then **401** (unauth) / **500** (admin env missing) / staging **errored**.

**Result: BLOCKED** on live staging until Next is healthy.

---

## G. Rating mobile

Uses existing Rating APIs only. Score chips 1–5, comment, submit, KeyboardAvoidingView, loading/empty/error. Status mapped (`locked` → Terkunci / Locked). No `rating-server` algorithm changes.

API regression after these changes: **PASS=20 FAIL=0**.

**Result: PASS (API contract)** · **BLOCKED (device UI)**

---

## H. Rating privacy

Subject `my-result` still strips reviewer ids. Employee cannot open reviewer task (**403**). HR dashboard **200**. Unchanged 12B behavior.

**Result: PASS**

---

## I. Rating bilingual

New `mobile/lib/i18n.tsx` + Profil **Indonesia / English**.  
No `EXPO_PUBLIC_…` / PocketBase in Rating UI. Terminology: Hasil Penilaian Saya, Tugas Penilaian Saya, Jumlah penilai, Penilai (privacy).

**Result: PASS (code)** · language switch **NOT TESTED on device**

---

## J. GPS device test

**BLOCKED / NOT TESTED** — no physical device run. Code still requests foreground location; GPS remains required; QR unused; offline attendance still throws (OFF).

---

## K. Keyboard / layout

**BLOCKED / NOT TESTED** on device. Rating has KeyboardAvoidingView + 44px score chips. Do not treat as PASS.

---

## L. Authentication

| Actor | Observed |
| --- | --- |
| Employee | own today/history APIs; rating my-result |
| Reviewer | own tasks; submit lock |
| HR | dashboard 200; correction 200 |
| Unauth | 401 |
| Forbidden | employee assignments 403; employee correction 403 |

Password not stored (SecureStore = token + model).

---

## M. Security

| Check | Result |
| --- | --- |
| Direct PB `attendance_logs` create | **PASS** staging 403 |
| Direct PB rating write | **PASS** 403 |
| GPS still on | **PASS** |
| Offline attendance | still OFF |
| Production PB/schema | **UNTOUCHED** |
| Staging Next currently | **errored** (see R) |

---

## N. Unit test

`npm run test:hr-rating-unit` → **PASS=24 FAIL=0**

---

## O. API test

- `test:hr-rating-api-staging` → **PASS=20 FAIL=0 WARN=0**  
- `test:hr-attendance-api-staging`  
  - After fixture, before crash: check-in / out-of-range / tamper / leave / inactive / correction / PB deny **PASS**; duplicate + checkout **FAIL** (date lookup). History **404**.  
  - After overlay `--update-env`: **FAIL** HTTP 500 admin env / staging down.

---

## P. Typecheck

`cd mobile && npm run typecheck` → **PASS** (0 errors)

Root `npm run typecheck` — script does not exist.

---

## Q. Build

- Staging Next `npm run build` **compiled** (`BUILD_ID=UOD-nzTLUN_0CnGBQjG8o`, route `/api/hr/attendance/history` present).  
- Local `npm run build` **not re-run**; last known FAIL is unrelated `bisnis/retur` WIP. Not fixed.

---

## R. Remaining blockers

1. **Staging Next is DOWN.** `pm2 restart --update-env` imported `.env.local` CRLF so `HOSTNAME=127.0.0.1\r` → `getaddrinfo ENOTFOUND`. Production was not restarted.  
   Recovery (Owner/ops, staging only):

   ```bash
   sed -i 's/\r$//' /var/www/erp-staging/.env.local
   sed -i '1s/^\xEF\xBB\xBF//' /var/www/erp-staging/.env.local
   set -a; . /var/www/erp-staging/.env.local; set +a
   cd /var/www/erp-staging
   pm2 restart erp-system-staging --update-env
   ```

   Do **not** use `--update-env` unless the shell already has the stripped staging env.

2. Duplicate check-in / check-out not proven after lookup fix (process crashed before retest).  
3. History API not confirmed on a healthy process.  
4. Device / GPS permission / keyboard **NOT TESTED**.  
5. Rating API test still clears `office_id`; re-seed office before attendance tests.  
6. Cross-company warehouse check-in still WARN.

---

## S. Production readiness

### Final gate

| Gate | Result |
| --- | --- |
| Attendance Mobile | **FAIL / BLOCKED** |
| Rating Mobile | **BLOCKED** (API PASS, device not tested) |
| Device test | **BLOCKED** |
| Security (staging PB write-lock) | **PASS** |
| Environment (repo config) | **PASS** |
| API regression (rating) | **PASS** |
| Attendance API suite (latest) | **FAIL** (staging Next down) |
| Unit | **PASS** |
| Production | **UNTOUCHED** |

**MOBILE NO-GO**

Do not deploy production.

---

## MOBILE UI/UX QUALITY

Gate: production-readiness UX on a real phone — not “functions exist.”  
**Real-device status: NOT TESTED.** Do not treat this section as PASS.

### Devices / platforms actually tested

| Platform | Device | Screen size | Result |
| --- | --- | --- | --- |
| iOS (physical) | — | — | **NOT TESTED** |
| Android (physical) | — | — | **NOT TESTED** |
| Emulator / simulator | — | — | **NOT TESTED** |
| Browser | — | — | **NOT TESTED** (not valid for this gate) |

Layout work below is **code review** against 360 / 375 / 390 / 414 CSS-px. That is **not** a device UAT.

### Code changes this pass (UX only)

No rating-server, GPS math, Leave lock, brand mark, or icon library change.

- Rating: dropped duplicate page title (header is the page title); short tabs Hasil/Tugas; score 28px; chips min 48×48; helper text; multiline comment; KeyboardAvoidingView + extra bottom inset so Submit can stay reachable.
- Attendance today: check-in / check-out **stacked** full-width; GPS copy mapped to “Lokasi berhasil diverifikasi.” / “Anda berada di luar area kantor.” (no meters / HTTP / EXPO in UI); date as compact title instead of a second “Absensi”.
- Attendance history: stacked Masuk / Pulang / status (no 3-column desktop row); “Masih bekerja” wraps.
- Tabs: Ionicons 22px + label 11px; existing Ionicons only.
- Login: keyboard avoid + stacked OTP (Verifikasi then Kembali).
- i18n: GPS + score helper + short rating tabs; status badges on today use ID/EN keys.

### Responsive layout (code review)

| Width | Overflow / clip (static) | Notes |
| --- | --- | --- |
| 360px | Expected OK after stack + wrap | Score chips 5×48 + gaps ≈ 264px inside ~300px card |
| 375px | Expected OK | Same layout |
| 390px | Expected OK | Same layout |
| 414px | Expected OK | Same layout |

**Result: NOT TESTED** on device. Remaining layout risks: long office names, long selfie-audit copy, 4-tab label “Meja kerja”, hub chips that scroll horizontally.

### Typography

Hierarchy used: header title → section title (16) → body (15) → helper/caption (12–13).  
Overall rating score reduced 36 → 28. Attendance clock 26 → 22.  
**Result: NOT TESTED** on device (readability / line-height).

### Icons (in-app)

Existing **Ionicons** only (`@expo/vector-icons`). Same set as web-adjacent mobile screens. No emoji UI icons. No second icon library.  
**Result: code reuse OK; sharpness on device NOT TESTED.**

### App icon / splash / assets (existing brand — not replaced)

| Asset | Config | File | Size |
| --- | --- | --- | --- |
| App icon (default) | `expo.icon` | `mobile/assets/systemLogo.png` | 1024×1024 |
| iOS icon | `ios.icon` | `mobile/assets/systemLogoIos.png` | 1024×1024 |
| Android adaptive | foreground `systemLogo.png`, bg `#ffffff` | same | 1024×1024 |
| Splash | `contain`, bg `#ffffff`, image `systemLogo.png` | same | 1024×1024 |
| Favicon | `web.favicon` | `systemLogo.png` | 1024×1024 |
| Notification | `expo-notifications` icon | `notificationIcon.png` | **96×96** |

Brand files were **not** redesigned. Splash `resizeMode: contain` + white background is unchanged.

**App icon result: NOT TESTED** on Home Screen / launcher / recents.  
**Splash result: NOT TESTED** on device aspect ratios.  
Static note: `notificationIcon.png` is 96×96 and looks aliased; Android status-bar icons usually need a white silhouette on transparency. **No asset swap without brand approval.**  
Static note: default `systemLogo.png` is a dark square; splash is white `contain` — on device this may look like a dark tile on a white splash. Existing, not changed.

### Keyboard

| Screen | Code | Device |
| --- | --- | --- |
| Login | KeyboardAvoidingView + scroll + stacked submit | **NOT TESTED** |
| Rating comment | KAV + paddingBottom ≥ inset+96 + Submit after comments | **NOT TESTED** |
| Attendance | no text fields on today | N/A |
| Search | no search on Rating/Attendance | N/A |

**Keyboard result: NOT TESTED.**

### Safe area

Tab bar already uses `useSafeAreaInsets` (`paddingBottom` / height). Rating adds bottom inset padding. Login uses `SafeAreaView` edges top+bottom.  
Notch / Dynamic Island / home indicator / Android nav bar: **NOT TESTED**.

### Rating UI (code)

Score 1–5 in one row, 48px min targets, helper “Pilih skor 1–5…”, comment multiline, Submit full-width after fields.  
**Rating UI result: NOT TESTED** (finger, keyboard covering Submit, helper clip).

### Attendance UI (code)

Primary actions stacked. GPS user copy mapped in `mobile/lib/attendance-ui.ts` (algorithm unchanged). History readable as stacked rows.  
**Attendance UI result: NOT TESTED** (GPS permission UI, in/out of geofence copy on a real phone).

### Dark / light

`userInterfaceStyle: automatic` already in `app.json`. No new theme. Contrast on both modes: **NOT TESTED**.

### Checklist (device gate)

| Item | Status |
| --- | --- |
| Tidak ada content terpotong | **NOT TESTED** |
| Tidak ada horizontal overflow | **NOT TESTED** |
| Font proporsional | Code adjusted; **NOT TESTED** |
| Icon proporsional | Code adjusted; **NOT TESTED** |
| Button nyaman disentuh | Code 48–52px; **NOT TESTED** |
| Navigation nyaman | Code adjusted; **NOT TESTED** |
| Rating score selector nyaman | Code 48px chips; **NOT TESTED** |
| Comment field nyaman | Code adjusted; **NOT TESTED** |
| Keyboard tidak menutup action | Code adjusted; **NOT TESTED** |
| Attendance action jelas | Stacked primary; **NOT TESTED** |
| Attendance history readable | Stacked rows; **NOT TESTED** |
| Safe area aman | Insets in code; **NOT TESTED** |
| App icon sesuai existing | Existing assets kept; **NOT TESTED** on device |
| Splash sesuai existing | Existing config kept; **NOT TESTED** |
| Icon tidak blur | In-app Ionicons; notification PNG aliased; **NOT TESTED** |
| ID/EN konsisten | Rating + GPS/status keys; selfie/help still mostly ID |
| Tidak ada technical string | GPS meters/HTTP mapped in UI; **NOT TESTED** live |
| iOS tested | **NOT TESTED** |
| Android tested | **NOT TESTED** |

### Remaining UI issues

1. No physical iPhone or Android UAT (this gate cannot PASS).  
2. Selfie-audit / hub / help copy on today still long and mostly Indonesian.  
3. Tab label “Meja kerja” is the longest of four tabs.  
4. `notificationIcon.png` 96×96 aliased; may render poorly in the status bar.  
5. Splash/adaptive use the existing dark-square `systemLogo.png` on white — visual fit on device unknown.  
6. Staging Next recovery is still a separate ops blocker; UX cannot be proven live until staging is up **and** a device build is installed.

**Mobile UI/UX quality: NOT TESTED. MOBILE remains NO-GO.**

---

## Exact outputs

### 1. What was changed

- Mobile env fail-fast; EAS staging vs production split; `.env.example` staging-first  
- Mobile today/history via Next API; history UI  
- Rating mobile copy + ID/EN + score chips + keyboard avoid  
- Staging PB `attendance_logs` write-lock + smoke office fixture  
- Additive `GET /api/hr/attendance/history` + more robust **today record lookup** (datetime `date` field)  
- Staging Next overlay + build; then a bad `--update-env` crashed staging Next

### 2. What was not changed

Production PB/app/DNS/Nginx; Leave lock; Rating algorithm; Payroll; Inventory; POS; WMS; dirty WIP retur/build errors

### 3. Files changed (local)

- `lib/hr/attendance-server.ts`  
- `app/api/hr/attendance/history/route.ts`  
- `scripts/pb-apply-attendance-write-lock-staging.mjs`  
- `scripts/seed-hr-attendance-office-staging.mjs`  
- `scripts/test-hr-attendance-api-staging.mjs`  
- `package.json`  
- `mobile/lib/env.ts`, `pocketbase.ts`, `errors.ts`, `attendance.ts`, `hr-attendance-api.ts`, `hr-rating-api.ts`, `i18n.tsx`, `attendance-ui.ts`  
- `mobile/app/_layout.tsx`, `(auth)/login.tsx`, `(tabs)/_layout.tsx`, `(tabs)/attendance.tsx`, `(tabs)/rating.tsx`, `(tabs)/profile.tsx`  
- `mobile/components/StaffHubSegmentBar.tsx`  
- `mobile/components/attendance/AttendanceCheckInPanel.tsx`, `AttendanceHistoryPanel.tsx`  
- `mobile/eas.json`, `mobile/.env.example`  
- `docs/PHASE_12E_MOBILE_STABILIZATION_REPORT.md`

### 4. Schema changes

**Staging only:** `attendance_logs` create/update/delete = **null**. Production schema unchanged.

### 5–15. Status summary

| Topic | Status |
| --- | --- |
| Attendance | Fixture + GPS in-range + out-of-range + PB deny proven once; duplicate/checkout not green; staging Next now down |
| Rating | API PASS; mobile UI code ready; device BLOCKED |
| Mobile | Config + screens landed; not device-UAT |
| Device test | BLOCKED |
| Security | Staging attendance writes locked; production untouched |
| Environment | Repo mapping PASS |
| Unit | PASS=24 |
| API | Rating PASS=20; attendance latest FAIL (staging down) |
| Build | Staging compiled then process errored; local retur WIP still FAIL |
| Remaining blockers | Staging Next CRLF HOSTNAME; device UAT; duplicate/checkout retest |
| Production safety | `pb-erp` + `erp-system` **17D / 0 restarts** |

**STOP. NO PRODUCTION DEPLOYMENT.**
