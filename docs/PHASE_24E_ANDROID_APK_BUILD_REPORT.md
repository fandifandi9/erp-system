# Phase 24E — Android APK UAT Build

**Date:** 2026-08-28
**Status:** READY FOR PHYSICAL ANDROID UAT
**Mode:** PRE-BUILD AUDIT → APK BUILD ONLY

---

## 1. Scope

Phase 24E builds an internal Android APK for UAT using:
- **Source**: Local (Phase 24 complete — notification system implemented)
- **Backend**: Staging (`https://staging.serba.space` / `https://pb-staging.serba.space`)
- **Output**: Internal APK for physical Android device testing
- **Production**: UNTOUCHED throughout

Phase 24E does NOT deploy any source code, modify any remote schema, or change any environment.

---

## 2. Source Baseline

| Component | Status |
|-----------|--------|
| Phase 24A — Capability Foundation | COMPLETE |
| Phase 24B — Notification Core | COMPLETE |
| Phase 24C — Push Token Infrastructure | COMPLETE |
| Phase 24D — Event Dispatch (leave, report) | COMPLETE |
| Mobile TypeScript (`tsc --noEmit`) | 0 errors |
| All regression tests | PASS |

Phase 24 changes present in working tree:
- `lib/notifications/` — types, dispatch, push, recipients
- `app/api/notifications/` — GET list + PATCH mark-read
- `app/api/push-tokens/` — POST register / DELETE deactivate
- `mobile/app/notifications/index.tsx` — notification center screen
- `mobile/lib/notifications-api.ts` — client API
- `mobile/lib/notifications.ts` — extended with server token registration
- `mobile/lib/work-dashboard-menu.ts` — Notifikasi tile added

---

## 3. EAS Account

| Field | Value |
|-------|-------|
| Username | `fandierp` |
| Email | `fandifandi9@gmail.com` |
| Verified | ✅ via `eas whoami` |

---

## 4. EAS Project

| Field | Value |
|-------|-------|
| Full name | `@fandierp/erp-staff-mobile` |
| Project ID | `4645bf17-9b30-440a-bebb-8f4c73ce1105` |
| Verified | ✅ matches `app.json` + `eas project:info` |

---

## 5. Build Profile

| Field | Value |
|-------|-------|
| Profile | `preview-apk` |
| Extends | `preview` → `staging` → `base` |
| Platform | `android` |
| Build type | `apk` |
| Distribution | `internal` |
| Resource class | `medium` |
| AAB (bundle) | NO |
| APK | YES ✅ |

Profile chain in `eas.json`:
```
preview-apk
  └── preview
        └── staging
              └── base
```

---

## 6. Environment Verification

| Variable | Value | Source |
|----------|-------|--------|
| `EXPO_PUBLIC_POCKETBASE_URL` | `https://pb-staging.serba.space` | `staging` profile |
| `EXPO_PUBLIC_ERP_WEB_URL` | `https://staging.serba.space` | `staging` profile |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | `4645bf17-9b30-440a-bebb-8f4c73ce1105` | `base` profile (added Phase 24E) |
| `EXPO_PUBLIC_PB_DISABLE_REALTIME` | `true` | `base` profile |

**Minimal change in Phase 24E**: Added `EXPO_PUBLIC_EAS_PROJECT_ID` to `base` env in `eas.json`. This was required for `getExpoPushTokenAsync()` to obtain a real Expo push token in the built APK. Without it, push token registration silently skipped in all builds.

**Localhost guard confirmed**: `mobile/lib/env.ts` `isLoopbackUrl()` + `rejectLoopbackInRelease()` blocks any loopback URL (`localhost`, `127.0.0.1`) in non-debug builds. The staging env variables are explicit and contain no loopback addresses.

**EAS confirmed loaded variables**:
```
Environment variables loaded from the "preview-apk" build profile "env" configuration:
EXPO_PUBLIC_PB_DISABLE_REALTIME, EXPO_PUBLIC_EAS_PROJECT_ID,
EXPO_PUBLIC_POCKETBASE_URL, EXPO_PUBLIC_ERP_WEB_URL.
```

---

## 7. Pre-Build Tests

| Test Suite | Result |
|-----------|--------|
| `npm run test:mobile-capabilities` | ✅ 227/227 PASS |
| `npm run test:notification-unit` | ✅ 133/133 PASS |
| `npm run test:hr-rating-unit` | ✅ 24/24 PASS |
| `npm run test:hr-reporting-unit` | ✅ 5/5 PASS |
| `npm run test:hr-wave2-leave` | ✅ 12/12 PASS |
| Mobile TypeScript `tsc --noEmit` | ✅ 0 errors |

All suites PASS. Build proceeded.

---

## 8. Android Configuration

| Field | Value |
|-------|-------|
| App name | SERBA System |
| Slug | `erp-staff-mobile` |
| Package / App ID | `com.erp.staff` |
| Version | `1.0.0` |
| Build version | `1` (remote-managed by EAS) |
| SDK version | `54.0.0` |
| Keystore | `j-DzHoluf2` (default, remote Expo server) |
| New Architecture | `newArchEnabled: true` |
| Edge-to-edge | `edgeToEdgeEnabled: true` |

**Permissions declared in `app.json`**:
- `android.permission.CAMERA`
- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`
- `android.permission.POST_NOTIFICATIONS` ✅ (required for push notifications)
- `android.permission.RECORD_AUDIO`

**`expo-notifications` config** (in `app.json` plugins):
```json
{
  "expo-notifications": {
    "icon": "./assets/notificationIcon.png",
    "color": "#111827",
    "sounds": [],
    "mode": "production"
  }
}
```

**Android channels** (runtime in `mobile/lib/notifications.ts`):
- `erp-notifications` — HIGH importance, "ERP Notifications" (Phase 24 new, primary)
- `default` — DEFAULT importance (legacy, backward-compatible)

---

## 9. Build Result

| Field | Value |
|-------|-------|
| Build ID | `90b46214-4fab-4328-9651-80e0bffbdb8d` |
| Status | `FINISHED` ✅ |
| Platform | `ANDROID` |
| Exit code | `0` |
| Build duration | ~17.6 minutes |
| Created at | `2026-08-28T08:21:16Z` |
| Completed at | `2026-08-28T08:38:58Z` |
| Expires | `2026-09-11T08:21:16Z` |
| Git commit | `7adfe7b5377ffc755d86128d7a2235f88478672a` |

> Note: The git commit hash refers to the last committed state. EAS uploaded the full working tree (including all Phase 24 uncommitted changes) via archive upload. All Phase 24 notification system files are included in the built APK.

---

## 10. APK Metadata

| Field | Value |
|-------|-------|
| Output format | `.apk` (not `.aab`) ✅ |
| App identifier | `com.erp.staff` |
| App version | `1.0.0` |
| Build number | `1` |
| Distribution | `INTERNAL` |
| Profile | `preview-apk` |
| Fingerprint hash | `032a93e04516d6d085952b43c4933d8e0b907728` |

---

## 11. APK URL

| Resource | URL |
|----------|-----|
| **APK Download** | https://expo.dev/artifacts/eas/zGU3MZqcRldGSodEeAxmFQz8x_OorP9tACXZO1OdY-E.apk |
| **Build dashboard** | https://expo.dev/accounts/fandierp/projects/erp-staff-mobile/builds/90b46214-4fab-4328-9651-80e0bffbdb8d |
| **Install (QR / link)** | https://expo.dev/accounts/fandierp/projects/erp-staff-mobile/builds/90b46214-4fab-4328-9651-80e0bffbdb8d |

APK expires: **2026-09-11** (14-day EAS internal distribution window).

---

## 12. Production Safety

| Safety Check | Status |
|-------------|--------|
| Production schema | UNTOUCHED |
| Production data | UNTOUCHED |
| Production rules | UNTOUCHED |
| Production application | UNTOUCHED |
| Staging source deploy | NOT DONE |
| Staging schema change | NOT DONE |
| Staging data change | NOT DONE |
| Remote migration | NOT DONE |
| commit | NOT DONE |
| push | NOT DONE |
| Play Store submission | NOT DONE |

Only change in Phase 24E: `EXPO_PUBLIC_EAS_PROJECT_ID` added to `eas.json` base env (local file only, no deployment).

---

## 13. Known Limitations

1. **Push notifications require Expo push service + FCM**: The APK registers Expo push tokens to the staging `/api/push-tokens` endpoint. The staging PocketBase does NOT yet have the `notifications` or `push_tokens` collections (migration not run on staging). Push token registration will fail silently on staging — this is expected for UAT Phase 1. Push delivery requires applying the schema to staging in a future phase.

2. **Notification center will show empty / offline error on staging**: The staging PocketBase lacks the `notifications` collection, so `GET /api/notifications` will return 500/404. The notification center screen has an error state and retry button for this case.

3. **`appVersionSource: remote`**: EAS manages build version numbers remotely. Build version `1` was used for this build.

4. **Git commit hash is last committed state**: Phase 24 changes were not committed (as per safety rules), but EAS archives and builds from the full working tree.

5. **iOS**: Not the UAT target for this phase. Architecture is cross-platform compatible but not tested.

---

## 14. Next Step — Physical Android UAT

**Phase 24F — Physical Android UAT** checklist:

1. **Install APK** on a physical Android device:
   - Open: https://expo.dev/accounts/fandierp/projects/erp-staff-mobile/builds/90b46214-4fab-4328-9651-80e0bffbdb8d
   - Scan QR code or tap the link on the device

2. **Feature regression** (manual):
   - [ ] Login with staging credentials
   - [ ] Logout
   - [ ] Dashboard / Meja Kerja
   - [ ] Attendance (check-in GPS)
   - [ ] Leave (view, submit)
   - [ ] Overtime (view, submit)
   - [ ] Reports (view, create)
   - [ ] Findings (view, create)
   - [ ] Rating (view tasks)
   - [ ] Attachment / Camera / Gallery
   - [ ] Profile

3. **Notification UAT** (requires staging schema applied):
   - [ ] Notification permission prompt appears
   - [ ] Notification center accessible from Meja Kerja → Notifikasi
   - [ ] After leave submit: HR receives in-app notification
   - [ ] Notification center shows notification, mark as read works
   - [ ] Tap notification navigates to correct screen

4. **Apply staging schema** (Owner decision, separate phase):
   ```
   node scripts/migrate-local-notifications-schema.mjs
   # (adapted for staging host — requires Owner approval)
   ```

5. **Push delivery test** (requires staging schema + FCM setup):
   - [ ] Register token in staging
   - [ ] Trigger leave submit via mobile
   - [ ] Confirm push notification received on HR device

**APK expires: 2026-09-11. Download before expiry.**

---

*End of Phase 24E Build Report.*
