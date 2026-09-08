# Phase 28 — Production Android UAT Bug Fix

**Date:** 2026-08-30  
**Mode:** LOCAL FIX → STAGING AUTOMATED VERIFICATION → (Production APK pending Owner)  
**Production APK tested (Phase 27):** `f6a288e5-bb1d-4729-8f27-fa95531e675a` (versionCode 2)  
**Endpoints (production APK):** `https://serba.space` · `https://pb.serba.space`

---

## FINAL STATUS

### **READY FOR PRODUCTION APK BUILD**

| Gate | Status |
|---|---|
| Local source fix | **PASS** |
| Local regression tests | **PASS** (418+ tests) |
| Mobile TypeScript | **0 errors** |
| Staging deploy (server overlay) | **PASS** — `BUILD_ID=eX4fb9vxGtfT15Wy3DEqU` |
| Staging automated verification | **PASS** (78 API/smoke tests) |
| Production web deploy | **NOT DONE** (by design — safety) |
| Production schema / data | **UNCHANGED** |
| Production APK build | **NOT STARTED** — awaiting Owner instruction |

**Blocker for full physical UAT success (post-APK):** Production VPS `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` in `/var/www/erp/.env.local` appear incorrect — server-side PocketBase admin auth fails against `pb.serba.space`. Code fixes sanitize client errors; **Owner must rotate/fix production admin credentials** and deploy the server overlay before attendance + HR attachments work end-to-end in production.

---

## 1. Physical UAT Findings

Physical Android UAT on Phase 27 production APK (`https://serba.space`):

| # | Area | Symptom |
|---|---|---|
| **BUG 1** | Absensi (check-in/out) | Generic error *"Terjadi kesalahan. Silakan coba lagi."* Office label *"muara karang 2"* visible; **ABSEN MASUK** and **ABSEN PULANG** remain empty (`-`). |
| **BUG 2** | Temuan HR — foto/bukti | User-visible error: *"Login admin PocketBase gagal: Email atau kata sandi admin salah."* Photos do not display. |
| **BUG 3** | Profile — save avatar | Delete photo ✓, pick new photo ✓, but **Simpan** button hidden/overlapped by image preview on real Android screen. |

---

## 2. Root Cause

### BUG 1 — Absensi gagal

End-to-end audit:

```
Mobile (GPS OK, office resolved)
  → POST /api/hr/attendance/check-in|check-out (authenticated)
  → Next.js HR API
  → getInventoryAdminPb() — server-side PocketBase admin session
  → FAIL: admin auth against pb.serba.space
  → 500 with internal admin-login message
  → mobile friendlyAttendanceMessage() masked any "PocketBase" text → generic common.error
```

**Primary root cause:** Production Next.js server cannot authenticate PocketBase admin (`POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` wrong or stale on VPS). Attendance never reaches geofence validation or record write.

**Secondary root cause:** Mobile error mapping treated all messages containing `"PocketBase"` as generic failure, hiding actionable HTTP status (401/403/503) and GPS-specific errors.

**Not the root cause:** GPS permission, mobile API URL, RBAC bypass, or missing mobile admin credentials (none found in mobile source).

### BUG 2 — Foto temuan tidak muncul

```
Mobile HR findings (authenticated user)
  → GET /api/hr/findings/[id]/attachments (Next.js API)
  → getInventoryAdminPb()
  → FAIL: same production admin auth failure
  → hrJsonError() returned raw 500 message to client
```

**Primary root cause:** Same server-side PocketBase admin auth failure as Bug 1.

**Security issue:** Internal admin login failure text leaked to mobile via `hrJsonError()` — **information disclosure**, not a mobile-side credential bug.

**Architecture audit:** Mobile does **not** use `POCKETBASE_ADMIN_*`, `admins.authWithPassword`, or superuser tokens. Flow is correct: authenticated user → Next.js API → server-side PB operation.

### BUG 3 — Tombol Simpan tertutup

**Root cause:** Profile edit screen placed the save button inside a long `ScrollView` below a large avatar preview. On smaller Android viewports / after image change, the button scrolled under the preview area or off-screen without a sticky footer.

---

## 3. Files Changed

### Server (error sanitization — deployed to staging only)

| File | Change |
|---|---|
| `lib/inventory/pb-service-error.ts` | **NEW** — `PbServiceUnavailableError`, `isSensitivePbServerMessage()`, `toClientSafeServiceError()` |
| `lib/inventory/pb-server.ts` | Admin auth failures throw safe `PbServiceUnavailableError` instead of leaking login details |
| `lib/hr/api-auth.ts` | `hrJsonError()` maps sensitive/admin errors → HTTP 503 safe message |

### Mobile

| File | Change |
|---|---|
| `mobile/lib/hr-attendance-api.ts` | `httpStatus` in API results; offline/network handling |
| `mobile/lib/attendance-ui.ts` | **NEW** — `friendlyAttendanceMessage()` with 401/403/503/GPS/admin-leak mapping |
| `mobile/lib/attendance.ts` | `httpStatus` in check-in/out return types |
| `mobile/lib/location.ts` | GPS timeout (25s), `hasServicesEnabledAsync()`, `Accuracy.Balanced` |
| `mobile/lib/mobile-api-error.ts` | **NEW** — filters admin/PocketBase leaks in reporting/findings errors |
| `mobile/lib/i18n.tsx` | `serviceUnavailable`, `gpsTimeout`, `gpsRequired` (id + en) |
| `mobile/components/attendance/AttendanceCheckInPanel.tsx` | Passes `httpStatus` to error mapper |
| `mobile/app/(tabs)/profile.tsx` | Sticky footer for **Simpan perubahan**, safe-area insets, smaller avatar (112px) |

### Tests & deploy tooling

| File | Change |
|---|---|
| `scripts/test-phase28-mobile-bugfix.mjs` | **NEW** — 17 regression/security tests |
| `scripts/create-phase28-deploy-pkg.py` | Staging server overlay package builder |
| `scripts/phase28-staging-deploy.sh` | Staging overlay deploy + build + pm2 restart |
| `package.json` | `test:phase28-mobile-bugfix` script |

---

## 4. Fix Implemented

### Server — safe error responses

- Sensitive patterns (`Login admin PocketBase`, `POCKETBASE_ADMIN`, `kata sandi admin`, etc.) never reach API clients.
- Clients receive HTTP **503** with: *"Layanan data sementara tidak tersedia. Coba lagi beberapa saat atau hubungi HR."*
- RBAC and authorization checks unchanged — no bypass.

### Mobile — Bug 1

- Propagate `httpStatus` from attendance API through to UI.
- Map 401 → re-login, 403 → forbidden, 503 → service unavailable, GPS timeout → dedicated message.
- Admin-leak strings mapped to `attendance.serviceUnavailable` (never shown raw).
- GPS: 25s timeout, services-enabled check, balanced accuracy.

### Mobile — Bug 2

- `mapReportingApiError()` sanitizes admin/PocketBase internal errors for findings/reports attachments.
- Architecture unchanged — still server-mediated; no mobile admin credentials added.

### Mobile — Bug 3

- `KeyboardAvoidingView` + `ScrollView` for form fields.
- **Sticky footer** outside scroll area with safe-area bottom inset.
- Avatar preview capped at 112×112; adequate hit area on save button.

---

## 5. Security Audit

| Check | Result |
|---|---|
| Mobile source scan for `POCKETBASE_ADMIN_*` | **CLEAN** |
| Mobile `admins.authWithPassword` | **NOT FOUND** |
| Mobile superuser / server credential in Expo env (production profile) | **NOT FOUND** |
| Production `eas.json` URLs | `https://serba.space` + `https://pb.serba.space` only |
| localhost / 127.0.0.1 in production mobile profile | **ABSENT** |
| staging URLs in production profile | **ABSENT** |
| Admin error text to client (before fix) | **LEAK** — fixed server-side |
| Attachment direct PB unauthenticated access | **403** (staging verified) |
| RBAC — staff cannot access HR findings | **403** (staging verified) |
| Cross-user attachment read | **403** (staging verified) |

---

## 6. Local Tests

| Suite | Result |
|---|---|
| `test:phase28-mobile-bugfix` | **17/17 PASS** |
| `test:mobile-capabilities` | **227/227 PASS** |
| `test:notification-unit` | **133/133 PASS** |
| `test:hr-rating-unit` | **24/24 PASS** |
| `test:hr-reporting-unit` | **5/5 PASS** |
| `test:hr-leave-wave2` | **12/12 PASS** |
| Mobile `npx tsc --noEmit` | **0 errors** |
| **Total (local)** | **418+ PASS** |

New regression coverage in `test-phase28-mobile-bugfix.mjs`:

- PB admin message detection + safe mapping
- Mobile attendance 401/403/503 + admin-leak mapping
- Mobile reporting admin-leak mapping
- Full mobile credential leak scan
- Production EAS profile URL validation

---

## 7. Staging Verification

**Deploy:** `scripts/phase28-staging-deploy.sh` on VPS `/var/www/erp-staging`  
**BUILD_ID:** `eX4fb9vxGtfT15Wy3DEqU`  
**PM2:** `erp-system-staging` restarted — online  
**Production:** health checks only — **not modified**

| Suite | Target | Result |
|---|---|---|
| `test-phase25-staging-smoke.mjs` | `staging.serba.space` | **47/47 PASS** |
| `test-hr-reporting-api-staging.mjs` | attachments + RBAC | **11/11 PASS** |
| `test-hr-attendance-api-staging.mjs` | check-in/out + geofence | **20/20 PASS** (1 WARN: cross-company fixture) |

Staging confirms:

- Server overlay builds and runs.
- Attendance check-in/out works when staging admin credentials are valid.
- Attachment upload (PNG), MIME rejection, max-count, auth isolation — all pass.
- Unauthenticated endpoints return 401; RBAC enforced.

---

## 8. Production Readiness

### Ready now (Owner action: build APK)

- Mobile fixes (profile UI, attendance error mapping, GPS timeout, safe client errors) are in local source and ready for EAS `production` Android APK build.
- Staging server overlay verified — safe to promote server files to production **when Owner approves production deploy**.

### Required before attendance + attachments work in production

1. **Fix production PocketBase admin credentials** on VPS (`/var/www/erp/.env.local`):
   - `POCKETBASE_ADMIN_EMAIL`
   - `POCKETBASE_ADMIN_PASSWORD`
   - Verify: admin auth against `https://pb.serba.space/api/admins/auth-with-password` succeeds.
2. **Deploy Phase 28 server overlay to production** (`lib/inventory/pb-service-error.ts`, `pb-server.ts`, `lib/hr/api-auth.ts`) — same package used for staging.
3. **Build new production APK** (EAS profile `production`, Android APK).
4. **Physical Android UAT** on new APK.

### Explicitly NOT done (safety)

- No production Next.js deploy (except future Owner-approved step above)
- No production schema migration
- No production data migration
- No production APK build in this phase run (awaiting Owner)

---

## 9. Remaining Physical UAT Items

| Item | Owner / next step |
|---|---|
| Fix production `POCKETBASE_ADMIN_*` credentials | **Owner** — VPS ops |
| Deploy server overlay to production | **Owner** — after credential fix |
| EAS production Android APK build | **Owner** — command when ready |
| Re-test Bug 1 absensi (check-in + check-out) on device | Physical UAT |
| Re-test Bug 2 Temuan HR photo upload + display | Physical UAT |
| Re-test Bug 3 profile save button visibility | Physical UAT |
| Regression: login, logout, cuti, lembur, luar kantor, rating, reporting, notifications, RBAC | Physical UAT |

Expected post-fix behavior:

- **Bug 1:** After credential fix + server deploy, check-in/out succeeds in office geofence; 503 shown only during real outages (not admin misconfig).
- **Bug 2:** No admin login text in UI; photos load via authenticated API when server admin session works.
- **Bug 3:** **Simpan** always visible in sticky footer (APK-only fix — no server deploy needed).

---

## Regression Audit (unchanged features)

Automated suites confirm no regression in:

- Login / session handling (401 paths)
- RBAC / capabilities (227 mobile capability tests)
- Notifications + push tokens (staging smoke)
- Leave auth layer
- Rating unit logic
- Reporting attachment validation
- HR findings RBAC

---

## Workflow Summary

```
Phase 27 APK (physical UAT) → 3 bugs found
        ↓
LOCAL source fix + tests PASS
        ↓
STAGING server overlay deploy + automated verification PASS
        ↓
READY FOR PRODUCTION APK BUILD  ← current stop point
        ↓
[Owner] Fix prod PB admin creds + deploy server overlay
        ↓
[Owner] EAS production APK
        ↓
Physical Android UAT re-test
```

---

*Phase 28 complete per automated gates. Production application and production APK intentionally not modified without Owner approval.*
