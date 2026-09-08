# Phase 27 — Production Android APK + Physical UAT

**Date:** 2026-08-29 (14:33 – 14:53 WIB)
**Mode:** PRE-BUILD AUDIT → EAS PRODUCTION APK BUILD
**Result:** **READY FOR PHYSICAL UAT**

---

## Source Verification

### Regression tests (pre-build)

| Suite | Result |
|---|---|
| `test:mobile-capabilities` | **227/227 PASS** ✓ |
| `test:notification-unit` | **133/133 PASS** ✓ |
| `test:hr-rating-unit` | **24/24 PASS** ✓ |
| `test:hr-reporting-unit` | **5/5 PASS** ✓ |
| `test:hr-leave-wave2` | **12/12 PASS** ✓ |
| Mobile `npx tsc --noEmit` | **0 errors** ✓ |
| **Total** | **401/401 PASS** |

### Phase coverage confirmed in source

| Phase | Component | Status |
|---|---|---|
| 24A | `mobile/lib/capabilities.ts` — fail-closed RBAC | ✓ |
| 24B | `mobile/app/notifications/`, `mobile/lib/notifications-api.ts` | ✓ |
| 24C | `mobile/lib/notifications.ts` — Expo push + `/api/push-tokens` | ✓ |
| 24D | `lib/notifications/dispatch.ts` — leave/report events | ✓ |
| 25 | Staging automated verification baseline unchanged | ✓ |

**Git HEAD (committed):** `7adfe7b5377ffc755d86128d7a2235f88478672a`

**Status: PASS ✓**

---

## Production Environment

### EAS production profile (`mobile/eas.json`)

| Variable | Value | Status |
|---|---|---|
| `EXPO_PUBLIC_ERP_WEB_URL` | `https://serba.space` | ✓ |
| `EXPO_PUBLIC_POCKETBASE_URL` | `https://pb.serba.space` | ✓ |
| `EXPO_PUBLIC_PB_DISABLE_REALTIME` | `true` | ✓ |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | `4645bf17-9b30-440a-bebb-8f4c73ce1105` | ✓ |

### Forbidden URLs — NOT in production profile

| URL | Present in production profile? |
|---|---|
| `localhost` / `127.0.0.1` | **NO** (only in `development` profile) |
| `staging.serba.space` | **NO** (only in `staging`/`preview` profiles) |
| `pb-staging.serba.space` | **NO** (only in `staging`/`preview` profiles) |

### Release build safety (`mobile/lib/env.ts`)

- `rejectLoopbackInRelease()` strips localhost URLs in non-`__DEV__` builds
- `requirePocketBaseUrl()` / `requireErpWebUrl()` fail-fast if unset
- No hardcoded staging/localhost in `mobile/app/` source

### Production API smoke (pre-build)

`scripts/test-phase26-production-smoke.mjs`: **25/25 PASS** ✓

**Status: PASS ✓**

---

## EAS Configuration

| Field | Expected | Actual | Status |
|---|---|---|---|
| App ID (Android package) | `com.erp.staff` | `com.erp.staff` | ✓ |
| EAS project | `@fandierp/erp-staff-mobile` | `@fandierp/erp-staff-mobile` | ✓ |
| Project ID | `4645bf17-9b30-440a-bebb-8f4c73ce1105` | `4645bf17-9b30-440a-bebb-8f4c73ce1105` | ✓ |
| Build profile | `production` | `production` | ✓ |
| Output format | `.apk` | `.apk` (`buildType: "apk"`) | ✓ |
| AAB / bundle | **NO** | **NO** | ✓ |
| iOS build | **NO** | **NO** | ✓ |
| EAS account | `fandierp` | `fandierp` (`fandifandi9@gmail.com`) | ✓ |
| App version | — | `1.0.0` | ✓ |
| `autoIncrement` | enabled | versionCode 1 → **2** | ✓ |

**Status: PASS ✓**

---

## Build Result

| Item | Value |
|---|---|
| **Status** | **FINISHED** ✓ |
| **EAS Build ID** | `f6a288e5-bb1d-4729-8f27-fa95531e675a` |
| **Build profile** | `production` |
| **Platform** | Android |
| **Distribution** | STORE (APK artifact) |
| **App version** | `1.0.0` |
| **Android versionCode** | `2` |
| **SDK version** | Expo 54.0.0 |
| **Build started** | 2026-08-29T07:39:26Z |
| **Build completed** | 2026-08-29T07:52:47Z |
| **Build duration** | ~13 min |
| **Build logs** | https://expo.dev/accounts/fandierp/projects/erp-staff-mobile/builds/f6a288e5-bb1d-4729-8f27-fa95531e675a |

**Status: PASS ✓**

---

## APK Details

| Field | Value |
|---|---|
| **APK URL** | https://expo.dev/artifacts/eas/kNpR-aMu_h1BBcUQ9NydcAbDAMCq5_3PBMMRVVpTOig.apk |
| **Format** | `.apk` (installable, not AAB) |
| **Package** | `com.erp.staff` |
| **Artifact expiry** | 2026-09-28 (EAS default 30-day retention) |

### APK safety check (build-time env baked in)

| Check | Result |
|---|---|
| ERP Web = `https://serba.space` | ✓ (from `eas.json` production `env`) |
| PocketBase = `https://pb.serba.space` | ✓ |
| No staging URLs | ✓ |
| No localhost | ✓ |

**Status: PASS ✓**

---

## API/RBAC Source Audit

### Capability model (`mobile/lib/capabilities.ts`)

- **Fail-closed:** null/unknown user → empty capability set
- **Server is authorization boundary** — capabilities govern UI only
- All 7 required roles tested: owner, hr, manager, staff, staff-basic, security, ob

### Role capability highlights (unit-tested)

| Role | Can approve leave | Can view findings | Can HR queue |
|---|---|---|---|
| owner | ✓ | ✓ | ✓ |
| hr | ✓ | ✓ | ✓ |
| manager | ✗ | ✗ | ✗ |
| staff | ✗ | ✗ | ✗ |
| staff-basic | ✗ | ✗ | ✗ |
| security | ✗ | ✗ | ✗ |
| ob | ✗ | ✗ | ✗ |

### Mobile module principle

Mobile shows **operational capabilities only** — not full desktop HR:

| Module | Mobile presence | Gated by |
|---|---|---|
| Dashboard / Kerja | ✓ | RBAC + operational gate |
| Attendance | ✓ | Tab + capability |
| Leave | ✓ | Tab + `leave.*` caps |
| Overtime | ✓ | HR native / capability |
| Laporan (reports) | ✓ | Personal tile + API |
| Temuan (findings) | ✓ | HR/Owner only (`finding.view`) |
| Rating | ✓ | `rating.task_*` caps |
| Notifications | ✓ | Universal personal tile |
| Inventory/WMS | ✓ | `inventory_role` overlay only |
| Full desktop HR admin | **NOT shown** | By design |

**Status: PASS ✓** (source audit)

---

## Notification Verification (source)

| Event | Dispatch function | Recipients |
|---|---|---|
| `leave.created` | `notifyLeaveCreated` | Users with `leave.approve` (owner + hr) |
| `leave.approved` / `leave.rejected` | `notifyLeaveDecision` | Submitting employee |
| `report.created` | `notifyReportCreated` | Users with `report.review` |

Source guarantees (unit-tested):

- User-scoped (`recipient = auth user`)
- Unread/read via `read_at`
- Ownership protected (mark-read authorization)
- Deep-link paths only (no auth tokens in payload)
- Privacy-safe titles/bodies (no sensitive data)
- Multi-device tokens supported (separate records per device)

**No mass notifications sent during Phase 27.**

**Status: PASS ✓** (source + production infra; push delivery pending physical UAT)

---

## Multi-Device Session (source)

Per Phase 17E architecture:

| Field | Used by | Purpose |
|---|---|---|
| `session_nonce` | Web/Desktop | PC session isolation |
| `mobile_session_nonce` | Android/iOS only | Mobile session isolation |

**PC + Android can coexist** — mobile login updates `mobile_session_nonce` only; web `session_nonce` is unaffected.

Implementation: `mobile/lib/auth-session.ts`, `mobile/context/auth.tsx`

**Status: PASS ✓** (source design; physical coexistence test pending)

---

## Installation

| Test | Result |
|---|---|
| APK downloaded | Available at URL above |
| Installed on physical Android | **NOT TESTED** |
| App launches without crash | **NOT TESTED** |

**Status: PENDING PHYSICAL UAT**

---

## Login

| Test | Result |
|---|---|
| Owner login | **NOT TESTED** |
| HR login | **NOT TESTED** |
| Employee/staff login | **NOT TESTED** |

**Recommended test accounts:** see `docs/SMOKE_TEST_ACCOUNTS.md` (production Owner accounts — use existing production credentials, not smoke seed on production).

**Status: PENDING PHYSICAL UAT**

---

## Attendance

| Test | Result |
|---|---|
| Check-in flow | **NOT TESTED** |
| GPS/location behavior | **NOT TESTED** |
| Logout/re-login | **NOT TESTED** |

**Status: PENDING PHYSICAL UAT**

---

## Leave

| Test | Result |
|---|---|
| Create leave request | **NOT TESTED** |
| Verify submission | **NOT TESTED** |
| Notification to approver | **NOT TESTED** |
| Approve/reject per RBAC | **NOT TESTED** |

**Status: PENDING PHYSICAL UAT**

---

## Overtime

| Test | Result |
|---|---|
| Create/request overtime | **NOT TESTED** |
| HR approval flow | **NOT TESTED** |

**Status: PENDING PHYSICAL UAT**

---

## Rating

| Test | Result |
|---|---|
| Open assigned rating task | **NOT TESTED** |
| Submit rating | **NOT TESTED** |
| Verify locked state after submit | **NOT TESTED** |

**Status: PENDING PHYSICAL UAT**

---

## Reporting

| Test | Result |
|---|---|
| Create staff report | **NOT TESTED** |
| JPEG attachment | **NOT TESTED** |
| PNG attachment | **NOT TESTED** |
| WebP attachment | **NOT TESTED** |

Source validation (unit): PNG/JPEG/WebP accepted; executable/oversize rejected — **5/5 PASS**.

**Status: PENDING PHYSICAL UAT**

---

## Findings

| Test | Result |
|---|---|
| HR/Owner can access findings | **NOT TESTED** |
| Employee cannot access privileged findings | **NOT TESTED** |

Source: `finding.view` capability absent for staff/manager/security/ob — **unit verified**.

**Status: PENDING PHYSICAL UAT**

---

## Notifications

| Test | Result |
|---|---|
| Permission prompt | **NOT TESTED** |
| Push token registration (`/api/push-tokens`) | **NOT TESTED** |
| Notification center screen | **NOT TESTED** |
| Unread badge | **NOT TESTED** |
| Mark read | **NOT TESTED** |
| Deep link navigation | **NOT TESTED** |
| Push delivery (FCM/Expo) | **NOT TESTED** |

**Status: PENDING PHYSICAL UAT**

---

## RBAC Negative Tests

| Test | Result |
|---|---|
| Employee cannot approve leave | Source ✓ / Physical **NOT TESTED** |
| Employee cannot manage findings | Source ✓ / Physical **NOT TESTED** |
| HR cannot access unrelated ERP modules | Source ✓ / Physical **NOT TESTED** |
| Unauthorized API → 401/403 | Production smoke **25/25 PASS** ✓ |

**Status: PARTIAL** — automated API checks pass; physical negative UI tests pending

---

## Multi-Device Test

| Test | Result |
|---|---|
| Same account: PC + Android simultaneous login | **NOT TESTED** |
| PC session survives Android login | **NOT TESTED** (design: separate nonce fields) |
| Second Android invalidates first Android | **NOT TESTED** |

**Status: PENDING PHYSICAL UAT**

---

## Logout

| Test | Result |
|---|---|
| Logout clears session | **NOT TESTED** |
| Reopen app requires re-auth | **NOT TESTED** |

**Status: PENDING PHYSICAL UAT**

---

## Issues Found

| ID | Severity | Description | Action |
|---|---|---|---|
| — | — | No bugs found during automated audit/build | — |

**Bug handling policy:** Any issues found during physical UAT → document as BUG/EXPECTED/ACTUAL/ROLE/DEVICE → fix LOCAL → regression → redeploy → APK rebuild. No hotfix on production.

---

## Production Safety

| Check | Result |
|---|---|
| Staging deployed | **NO** ✓ |
| Staging modified | **NO** ✓ |
| Production schema migrated | **NO** ✓ |
| Production RBAC changed | **NO** ✓ |
| Production web redeployed | **NO** ✓ |
| Mass notifications sent | **NO** ✓ |
| Production business data modified | **NO** ✓ |
| New mobile modules added | **NO** ✓ |
| iOS build | **NO** ✓ |
| AAB build | **NO** ✓ |

---

## Final Status

```
READY FOR PHYSICAL UAT
```

### Completed (automated)

| Criterion | Status |
|---|---|
| Pre-build regression (401/401) | **PASS** ✓ |
| Mobile TypeScript 0 errors | **PASS** ✓ |
| Production env URLs correct | **PASS** ✓ |
| EAS config audit (APK, not AAB) | **PASS** ✓ |
| Production Android APK built | **PASS** ✓ |
| APK installable format (.apk) | **PASS** ✓ |
| Production endpoints baked in | **PASS** ✓ |
| No staging/localhost in production build | **PASS** ✓ |
| Capability/RBAC source audit | **PASS** ✓ |
| Notification source flow audit | **PASS** ✓ |
| Multi-device session design | **PASS** ✓ |
| Production API smoke | **25/25 PASS** ✓ |

### Pending (requires Owner physical Android device)

| Criterion | Status |
|---|---|
| APK install + launch | **PENDING** |
| Login (Owner/HR/Employee) | **PENDING** |
| Attendance + GPS | **PENDING** |
| Leave + notification flow | **PENDING** |
| Overtime | **PENDING** |
| Rating | **PENDING** |
| Reporting + attachments | **PENDING** |
| Findings RBAC (physical) | **PENDING** |
| Push delivery | **PENDING** |
| PC + Android coexistence | **PENDING** |
| Logout/session | **PENDING** |

### Install APK

Download and sideload on Android:

**https://expo.dev/artifacts/eas/kNpR-aMu_h1BBcUQ9NydcAbDAMCq5_3PBMMRVVpTOig.apk**

Build dashboard:

**https://expo.dev/accounts/fandierp/projects/erp-staff-mobile/builds/f6a288e5-bb1d-4729-8f27-fa95531e675a**

---

**PHASE 27 automated scope: COMPLETE.**
**Physical UAT: awaiting Owner device testing.**
