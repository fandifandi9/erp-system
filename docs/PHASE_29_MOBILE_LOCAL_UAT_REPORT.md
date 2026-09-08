# Phase 29 — Mobile Local UAT & UI/UX Refinement

**Date:** 2026-08-30  
**Mode:** LOCAL MOBILE ONLY — development runtime / hot reload  
**Production:** UNTOUCHED  
**Staging:** UNTOUCHED  
**APK / EAS production:** NOT BUILT  

---

## FINAL STATUS

### **READY FOR OWNER PHYSICAL LOCAL UAT**

| Gate | Status |
|---|---|
| Mobile source audit | **DONE** |
| UI/UX refinements (Phase 27 priorities) | **DONE** |
| Error UX sanitization | **DONE** |
| Security scan (no admin credentials) | **PASS** |
| Mobile TypeScript | **0 errors** |
| Automated regression | **436+ PASS** |
| Owner physical Android UAT | **PENDING** |

**Do not proceed to Staging deploy or Production APK until Owner completes physical local UAT.**

---

## 1. Audit Summary (from Phase 27/28)

Prior physical UAT (production APK) found:

| Bug | Phase 28 fix | Phase 29 refinement |
|---|---|---|
| Absensi gagal (server admin creds on prod) | Error mapping + GPS timeout | **Sticky check-in/out footer** — buttons always visible on 360–430px screens |
| Foto temuan tidak muncul (server-side) | `mapReportingApiError` sanitization | **Sticky Kirim footer**, error banner, empty evidence state on detail |
| Tombol Simpan tertutup (profile) | Sticky footer (Phase 28) | **Verified** + password error text sanitized |

Mobile architecture remains correct: authenticated user → Next.js API → server-side PocketBase. No admin credentials in mobile bundle.

---

## 2. Features Reviewed (Automated + Code Audit)

| Area | Automated | Notes |
|---|---|---|
| **Auth** — login, logout, session | Code audit | Session nonce sync; user-facing errors no longer mention PocketBase internals |
| **RBAC** — 7 roles | **227/227 PASS** | capabilities.ts fail-closed |
| **Attendance** — GPS, check-in/out, errors | Phase 28 + 29 tests | Sticky action footer; `friendlyAttendanceMessage()` |
| **Leave** | **12/12 PASS** | Unchanged business logic |
| **Reporting / Findings** | **5/5 PASS** + UI | Sticky submit; attachment preview/empty states |
| **Profile** | UI + error UX | Sticky save; avatar 112px; safe-area footer |
| **Rating** | **24/24 PASS** | Locked-after-submit logic intact |
| **Notifications** | **133/133 PASS** | Sanitized load errors |

Physical verification on device is **Owner responsibility** (see §8).

---

## 3. Bugs Found & Fixed (Phase 29)

### BUG A — Technical errors could reach users via `getErrorMessage()`

**Symptom:** Profile, leave, and generic PocketBase errors could expose `HTTP 500`, `POCKETBASE_ADMIN`, env var names, or internal URLs.

**Root cause:** `getErrorMessage()` returned raw server/ClientResponseError text without filtering.

**Fix:** `sanitizeUserFacingMessage()` in `mobile/lib/errors.ts` — all `getErrorMessage()` paths now strip technical patterns.

### BUG B — Attendance buttons scroll off-screen on small Android

**Symptom:** After selfie preview + status card, check-in/out buttons require scrolling on narrow viewports.

**Root cause:** Action buttons inside the same `ScrollView` as content.

**Fix:** `AttendanceCheckInPanel` — flex root + scrollable content + **sticky footer** with check-in/out (safe-area aware, min height 52px).

### BUG C — Report/Finding submit buried below form + attachments

**Symptom:** On long forms with 5 thumbnails, **Kirim** could be off-screen.

**Root cause:** Submit button at bottom of `ScrollView`.

**Fix:** `MobileCaseForm` — **sticky footer** for submit; camera/gallery remain in scroll; inline error banner.

### BUG D — Finding detail: no empty state for missing photos

**Symptom:** Blank area when case has no attachments.

**Fix:** `MobileCaseDetail` — dashed empty state + improved error screen with icon.

### BUG E — Auth/session errors mentioned PocketBase schema

**Symptom:** `"Tambahkan field mobile_session_nonce… di PocketBase"` shown to end users.

**Fix:** `mobile/context/auth.tsx` — generic *"Gagal memperbarui sesi. Silakan coba lagi atau hubungi HR."*

---

## 4. Files Changed

| File | Change |
|---|---|
| `mobile/lib/errors.ts` | `sanitizeUserFacingMessage()`, filtered `getErrorMessage()` |
| `mobile/context/auth.tsx` | User-safe session/MFA error messages |
| `mobile/app/(tabs)/profile.tsx` | Password error fallback (no PocketBase mention) |
| `mobile/app/notifications/index.tsx` | Sanitized notification load errors |
| `mobile/components/attendance/AttendanceCheckInPanel.tsx` | Sticky check-in/out footer, safe-area |
| `mobile/components/reporting/MobileCaseForm.tsx` | Sticky submit footer, error banner |
| `mobile/components/reporting/MobileCaseDetail.tsx` | Empty evidence state, error UI |
| `mobile/lib/i18n.tsx` | `reporting.noEvidence` (id + en) |
| `mobile/.env.example` | LAN IP instructions for physical Android dev |
| `scripts/test-phase29-mobile-uat.mjs` | **NEW** — 18 regression tests |
| `package.json` | `test:phase29-mobile-uat` script |

---

## 5. UI/UX Improvements

| Screen | Improvement |
|---|---|
| **Absensi** | Check-in/out always visible (sticky footer); safe-area bottom inset |
| **Laporan / Temuan (form)** | Kirim always visible; error banner with icon; min touch target 52px |
| **Laporan / Temuan (detail)** | Empty evidence placeholder; fullscreen viewer close respects safe-area top |
| **Profil** | Sticky Simpan (Phase 28, verified); cleaner password error |
| **Notifikasi** | No raw HTTP/technical errors on load failure |
| **Global error UX** | Central sanitization — no admin creds, stack traces, internal URLs |

Layout targets: **360px, 390px, 430px** width; Android navigation bar via `useSafeAreaInsets`.

---

## 6. Security Audit

| Check | Result |
|---|---|
| `POCKETBASE_ADMIN_*` in mobile source | **NOT FOUND** |
| `admins.authWithPassword` in mobile | **NOT FOUND** |
| Superuser / service credentials in Expo env | **NOT FOUND** |
| Technical error leak to UI | **MITIGATED** (`errors.ts`, `mobile-api-error.ts`, `attendance-ui.ts`) |
| Attachment auth architecture | Unchanged — server-mediated |

---

## 7. Tests

| Suite | Result |
|---|---|
| `test:phase29-mobile-uat` | **18/18 PASS** |
| `test:phase28-mobile-bugfix` | **17/17 PASS** |
| `test:mobile-capabilities` | **227/227 PASS** |
| `test:notification-unit` | **133/133 PASS** |
| `test:hr-rating-unit` | **24/24 PASS** |
| `test:hr-reporting-unit` | **5/5 PASS** |
| `test:hr-leave-wave2` | **12/12 PASS** |
| Mobile `npx tsc --noEmit` | **0 errors** |
| **Total** | **436+ PASS** |

---

## 8. Owner — Physical Android Local UAT Guide

### Prerequisites (one-time)

1. **Next.js dev server** (repo root):
   ```bash
   npm run dev
   ```
2. **Local PocketBase** (if testing against local PB, not staging):
   ```bash
   node scripts/bootstrap-local-pb.mjs
   ```
3. **Find your PC LAN IP** (same Wi‑Fi as phone):
   ```powershell
   ipconfig
   ```
   Example: `192.168.1.42`

### Configure mobile `.env`

Copy `mobile/.env.example` → `mobile/.env` and set (replace IP):

```env
EXPO_PUBLIC_ERP_WEB_URL=http://192.168.1.42:3000
EXPO_PUBLIC_POCKETBASE_URL=http://192.168.1.42:8090
EXPO_PUBLIC_PB_DISABLE_REALTIME=true
```

> **Physical device cannot use `localhost`.** Use LAN IP. Emulator may use `10.0.2.2:3000`.

### Start Expo dev client

```bash
cd mobile
npm install
npx expo start
```

- Scan QR with **Expo Go** or installed **development build** (`expo-dev-client`).
- Or press `a` for Android emulator.

### After code changes

- Save file → app **hot reloads** automatically.
- If stuck: shake device → **Reload**, or press `r` in Expo terminal.

### Physical UAT checklist (Owner)

- [ ] Login / logout
- [ ] Session persists after app background
- [ ] PC + Android same user (no forced logout)
- [ ] Absensi: GPS permission, check-in, check-out, error messages readable
- [ ] Cuti: create, status, approve (HR role)
- [ ] Laporan: camera, gallery, upload, preview, submit
- [ ] Temuan HR (HR/Owner): create, photo display
- [ ] Profil: delete photo, pick photo, **Simpan visible and tappable**
- [ ] Rating: task list, submit, locked after submit
- [ ] Notifikasi: list, unread badge, tap to open, empty state

Report any FAIL back before Staging or Production APK.

---

## 9. Regression (unchanged features)

No business-logic changes to:

- Login / RBAC / capabilities
- Leave approval rules
- Rating scoring / lock
- Attachment MIME/size validation (max 5 × 10 MB)
- Push token registration
- Offline attendance queue (disabled by design)

---

## 10. What Was NOT Done (by design)

- No Production deploy
- No Staging deploy
- No EAS production APK
- No schema / data migration
- No git commit / push

---

## Workflow Position

```
Phase 28 (server + mobile bugfix) ──► Phase 29 (local mobile UI/UX) ──► YOU ARE HERE
                                              │
                                              ▼
                              Owner physical local UAT on Android
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                    (if PASS) Staging verify          (if FAIL) fix locally + reload
                              │
                              ▼
                    Production APK (Owner approval only)
```

---

*Phase 29 automated gates complete. Awaiting Owner physical Android UAT.*
