# PHASE 17 — ANDROID APK DEVICE UAT

Date: 2026-08-27

Status: **IN PROGRESS — Awaiting EAS build**

---

## Build

APK: *(pending build)*
Version: 1.0.0
Version Code: *(remote — auto from EAS)*
Expo/EAS Profile: `preview-apk`
Distribution: internal
Target Environment: Staging

## Backend

API: https://staging.serba.space
PocketBase: https://pb-staging.serba.space

## Device

Model: *(pending installation)*
Android Version: *(pending)*

---

## Configuration Safety

| Check | Result | Notes |
|---|---|---|
| Localhost in APK | **PASS** | `isLoopbackUrl()` guard rejects localhost in release builds |
| 127.0.0.1 in APK | **PASS** | Fallback goes to `https://unconfigured.invalid`, never loopback |
| Staging URL correct | **PASS** | `preview-apk` inherits staging env: `staging.serba.space` / `pb-staging.serba.space` |
| Production URL | **PASS** | Production profile isolated; `preview-apk` does not touch production |
| Environment variables | **PASS** | `mobile/.env` has staging URLs only; no localhost |

---

## Pre-Build Checks

| Check | Result |
|---|---|
| Mobile TypeScript (`tsc --noEmit`) | **PASS** — 0 errors |
| Rating unit tests | **PASS** — 24/24 |
| Reporting unit tests | **PASS** — 5/5 |
| Leave unit tests | **PASS** — 12/12 |

---

## EAS Build Configuration

```
BUILD PROFILE:      preview-apk
BUILD TYPE:         APK  (android.buildType = "apk")
API BASE URL:       https://staging.serba.space
POCKETBASE URL:     https://pb-staging.serba.space
TARGET ENVIRONMENT: Staging
DISTRIBUTION:       internal
```

### eas.json audit (relevant profiles)

| PROFILE | ENVIRONMENT | API BASE URL | POCKETBASE URL | BUILD TYPE | STATUS |
|---|---|---|---|---|---|
| development | Development | http://localhost:3000 | (unset) | AAB | ❌ UNSAFE — localhost |
| staging | Staging | https://staging.serba.space | https://pb-staging.serba.space | AAB | ⚠️ Safe URL, output bukan APK |
| preview | Staging (extends staging) | https://staging.serba.space | https://pb-staging.serba.space | AAB | ⚠️ Safe URL, output bukan APK |
| **preview-apk** | **Staging (extends preview)** | **https://staging.serba.space** | **https://pb-staging.serba.space** | **APK** | **✅ CORRECT — APK, staging** |
| production | Production | https://serba.space | https://pb.serba.space | APK | Production only, bukan untuk UAT |

---

## Build

APK generation: *(pending — EAS build belum dijalankan)*
APK installation: *(pending)*
App startup: *(pending)*

### Next Step

```bash
# Jalankan di folder mobile/ setelah `npx eas-cli login`
npx eas-cli build --platform android --profile preview-apk --non-interactive
```

---

## Login

Employee: *(pending)*
HR: *(pending)*
Owner: *(pending)*
Invalid login: *(pending)*
Logout: *(pending)*

## Attendance

GPS permission: *(pending)*
Location: *(pending)*
Check-in: *(pending)*
Check-out: *(pending)*
Duplicate: *(pending)*
Out-of-range: *(pending)*
Leave block: *(pending)*
History: *(pending)*

## Rating

Task: *(pending)*
5 aspects: *(pending)*
Score: *(pending)*
Comment: *(pending)*
Submit: *(pending)*
Lock: *(pending)*
Privacy: *(pending)*

## Reporting

Create: *(pending)*
Submit: *(pending)*
Error handling: *(pending)*

## Findings

HR/Owner: *(pending)*
Employee restriction: *(pending)*

## Camera

Permission: *(pending)*
Capture: *(pending)*
Preview: *(pending)*
Delete: *(pending)*
Cancel: *(pending)*

## Gallery

Permission: *(pending)*
Select: *(pending)*
Preview: *(pending)*
Delete: *(pending)*
Cancel: *(pending)*

## Attachment

Upload: *(pending)*
Max 5: *(pending)*
JPEG: *(pending)*
PNG: *(pending)*
WebP: *(pending)*
Invalid: *(pending)*
10 MB: *(pending)*
Preview: *(pending)*
Delete: *(pending)*
Security: *(pending)*

## UI/UX

No clipping: *(pending)*
No overflow: *(pending)*
Keyboard: *(pending)*
Safe area: *(pending)*
Navigation: *(pending)*
Icons: *(pending)*

## I18N

ID: *(pending)*
EN: *(pending)*

## Offline

*(pending)*

## Issues

*(none recorded yet)*

---

## Final Status

```
BUILD:            PENDING
APK:              PENDING
DEVICE:           PENDING
LOGIN:            PENDING
ATTENDANCE:       PENDING
GPS:              PENDING
RATING:           PENDING
REPORTING:        PENDING
FINDINGS:         PENDING
CAMERA:           PENDING
GALLERY:          PENDING
ATTACHMENT:       PENDING
I18N:             PENDING
UI/UX:            PENDING
OFFLINE:          PENDING
PRODUCTION SAFETY: PASS — production tidak disentuh
```
