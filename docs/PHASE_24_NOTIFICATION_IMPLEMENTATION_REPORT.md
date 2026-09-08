# Phase 24 — Mobile RBAC Notification System
## Implementation Report

**Date:** 2026-08-28
**Status:** READY FOR ANDROID APK UAT
**Environment:** LOCAL ONLY — Production/Staging UNTOUCHED

---

## 1. Scope

Phase 24 implements the Mobile RBAC Notification System across three combined sub-phases:

- **24B — Notification Core**: Shared types, PocketBase schema, server-side create/dispatch, in-app notification center.
- **24C — Push Token Infrastructure**: Expo push token registration, multi-device lifecycle, Expo push delivery.
- **24D — Event Dispatch**: RBAC-based recipient resolution wired into leave/report API routes.

Phase 24A (Capability Foundation) was already complete; this phase uses `resolveMobileCapabilities()`, `hasCapability()`, and related functions from `mobile/lib/capabilities.ts` as its foundation.

---

## 2. Existing Notification Infrastructure (Audit)

| Item | Status Before Phase 24 |
|------|------------------------|
| `mobile/lib/notifications.ts` | EXISTS — `usePushRegistration()` hook requesting permission, creating Android "default" channel, calling `getExpoPushTokenAsync`. Token was NOT registered to server. |
| `expo-notifications ~0.32.17` | EXISTS — in mobile package.json |
| Server push API | NOT EXISTS |
| `notifications` PocketBase collection | NOT EXISTS (local) |
| `push_tokens` PocketBase collection | NOT EXISTS (local) |
| Notification center screen | NOT EXISTS |

**Decision**: Extend existing `mobile/lib/notifications.ts`. Add `erp-notifications` Android channel alongside legacy `default` channel (backward-compatible). Register token to server after permission granted.

---

## 3. Notification Architecture

```
MOBILE CLIENT
  └── usePushRegistration()        // request permission + obtain Expo token
        └── registerPushToken()    // POST /api/push-tokens (fire-and-forget)

SERVER EVENT (leave submit, approve, etc.)
  └── resolveLeaveApprovers()      // RBAC: owner OR hr, company-scoped
        └── notifyLeaveCreated()   // createNotificationRecord() + pushToUsers()
              ├── notifications    // PocketBase record (idempotency-checked)
              └── Expo Push API    // https://exp.host/--/api/v2/push/send

MOBILE APP
  ├── /notifications               // Notification center screen
  │     ├── fetchNotifications()   // GET /api/notifications
  │     └── markNotificationRead() // PATCH /api/notifications/[id]/read
  └── Push tap → action path       // re-authorizes at target screen
```

**Security principle**: Dispatch is server-only. Mobile client never determines recipients. Notification payloads contain only generic text and resource IDs. Target screens perform independent re-authorization.

---

## 4. notifications Schema

**Collection**: `notifications` (LOCAL PocketBase)

| Field | Type | Notes |
|-------|------|-------|
| `recipient` | relation → users | Required; enforced in listRule/viewRule |
| `type` | text | Required; e.g., `leave.created`, `leave.approved` |
| `title` | text | Generic, non-sensitive |
| `body` | text | Generic, non-sensitive |
| `resource_type` | text | e.g., `leave_requests` |
| `resource_id` | text | PocketBase record ID |
| `action` | text | Deep link path e.g., `/leave` |
| `read_at` | date | null = unread |
| `idempotency_key` | text | Prevents duplicate events |

**Rules (user-scoped)**:
```
listRule:   @request.auth.id = recipient
viewRule:   @request.auth.id = recipient
createRule: null  (server admin only)
updateRule: @request.auth.id = recipient  (for mark-read)
deleteRule: null  (server admin only)
```

---

## 5. push_tokens Schema

**Collection**: `push_tokens` (LOCAL PocketBase)

| Field | Type | Notes |
|-------|------|-------|
| `user` | relation → users | Required |
| `token` | text | Required; validated as ExponentPushToken[...] format |
| `platform` | select | `android`, `ios` |
| `device_id` | text | Optional; enables per-device deduplication |
| `is_active` | bool | false = deactivated (logout or DeviceNotRegistered) |
| `last_seen` | date | Refreshed on registration/update |

**Rules (user-scoped)**:
```
listRule:   @request.auth.id = user
viewRule:   @request.auth.id = user
createRule: @request.auth.id != ""  (authenticated users can register)
updateRule: @request.auth.id = user
deleteRule: null  (server deactivates via is_active = false)
```

**Multi-device**: Each `(user, device_id)` pair is a separate record. Multiple active tokens per user are fully supported.

---

## 6. Token Lifecycle

| Event | Action |
|-------|--------|
| App startup / login | `usePushRegistration()` → request permission → obtain Expo token → `POST /api/push-tokens` |
| Token already exists for device | `PATCH` existing record (update token, set is_active=true, refresh last_seen) |
| Logout | `DELETE /api/push-tokens` (deactivates device token only; other devices unaffected) |
| Token rotated by Expo | New `registerPushToken()` call updates the record |
| `DeviceNotRegistered` from Expo | `deactivateToken()` sets is_active=false for that token |
| Other user devices | Independent records; other sessions unaffected |

Token cleanup is **non-aggressive**: only the specific device token is deactivated on logout. No bulk deletion.

---

## 7. RBAC Recipient Resolution

Recipients are resolved using the Phase 24A capability model. The mapping lives exclusively in `lib/notifications/recipients.ts`:

| Event | Required Capability | Resolved Roles |
|-------|---------------------|----------------|
| `leave.created` | `leave.approve` | `account_type=owner` OR `role_code=hr` |
| `leave.approved` | — | Requester user ID (from leave record) |
| `leave.rejected` | — | Requester user ID (from leave record) |
| `overtime.created` | `overtime.approve` | Owner OR HR |
| `overtime.approved/rejected` | — | Requester |
| `report.created` | `report.review` | Owner OR HR |
| `field_activity.created` | `field_activity.approve` | Owner OR HR |
| `rating.task_assigned` | — | Assigned reviewer IDs |

**No hard-coded `if role === "hr"` logic.** The `resolveCapabilityHolders()` function maps capability → role filter in one place. If the capability model changes, this single function is updated.

**Company scope**: Recipient resolution optionally filters by company membership via `biz_user_companies`. Owner accounts bypass company scope (they see all companies). Fail-open on company scope error (to avoid silently dropping notifications).

---

## 8. Implemented Events

### A. LEAVE — ✅ IMPLEMENTED

| Event | Trigger | Recipients | Idempotency |
|-------|---------|------------|-------------|
| `leave.created` | `POST /api/hr/leave` (submit) | HR/Owner approvers | `leave.created:{id}:{recipientId}` |
| `leave.approved` | `POST /api/hr/leave/[id]/approve` | Requester | `approved:{id}:{recipientId}` |
| `leave.rejected` | `POST /api/hr/leave/[id]/reject` | Requester | `rejected:{id}:{recipientId}` |

### B. OVERTIME — ⏳ ARCHITECTURE READY / FUTURE

Dispatch functions (`notifyOvertimeCreated`, `notifyOvertimeDecision`) are implemented in `lib/notifications/dispatch.ts`. Overtime API routes exist but were not modified to preserve Phase 22 regression stability. Wire in Phase 24E/25.

**Reason**: Overtime routes use a different server function pattern. The notification dispatch architecture is ready; only the route wiring is deferred.

### C. STAFF REPORTS — ✅ IMPLEMENTED

| Event | Trigger | Recipients | Notes |
|-------|---------|------------|-------|
| `report.created` | `reportingSubmit()` in `lib/hr/reporting-http.ts` | HR/Owner reviewers | Only for `kind === "report"` (not findings) |

### D. FINDINGS — ⏳ NOT IMPLEMENTED

Findings are typically created BY HR/Owner users, making recipient resolution ambiguous (sender = receiver). No clear distinct recipient. Documented as FUTURE.

**When finding workflow defines a distinct authorized recipient, wire `notifyFindingCreated()` in the finding route.**

### E. RATING — ⏳ ARCHITECTURE READY / FUTURE

`notifyRatingTaskAssigned()` is implemented in `lib/notifications/dispatch.ts`. Rating assignment logic requires knowing the specific reviewer IDs, which requires deeper integration with the rating period/task workflow. Wire in Phase 25.

### F. OTHER MODULES (Warehouse, Accounting, Admin) — ⏳ FUTURE

No clear event + authorization + recipient available. Documented for future phases.

---

## 9. Deferred Events

| Event | Reason Deferred |
|-------|----------------|
| `overtime.created/approved/rejected` | Route wiring deferred for regression safety; dispatch functions ready |
| `field_activity.*` | Route wiring deferred; dispatch functions ready |
| `finding.created` | No distinct recipient (HR creates finding; target unclear) |
| `rating.task_assigned` | Requires reviewer ID from assignment workflow; deferred to Phase 25 |
| `report.closed` | Identifies requester from record; wire when report.closed route is tested |
| Warehouse/WMS events | No mobile notification surface defined yet |
| Accounting/payroll events | Sensitive data; generic notification possible in future |

---

## 10. Notification Center

**Screen**: `mobile/app/notifications/index.tsx`

**Features implemented**:
- Notification list (paginated, newest first)
- Unread indicator (dot per row + badge in header)
- Mark as read on tap (optimistic UI update)
- Navigate to action path on tap (target re-authorizes)
- Pull-to-refresh
- Empty state (icon + text)
- Loading state (spinner)
- Error state (offline message + retry button)
- Per-type icons and color coding

**Access**: Added as a "Notifikasi" tile in `mobile/lib/work-dashboard-menu.ts` (Personal group). Available to all authenticated users.

**Navigation**: `router.push("/notifications")` — accessible from work dashboard tile and from push notification taps.

---

## 11. Push Notification

**Provider**: Expo Push Notification Service → FCM (Android) / APNs (iOS)

**Channel (Android)**:
- `erp-notifications` — "ERP Notifications", HIGH importance (new, primary)
- `default` — legacy channel preserved for backward compatibility

**Dispatch flow**:
1. Server creates notification record (idempotency-checked)
2. Server calls `pushToUsers()` → `getActiveTokensForUsers()` → `sendExpoPushNotifications()`
3. Expo sends to `exp.host/--/api/v2/push/send`
4. Expo forwards to FCM/APNs
5. On `DeviceNotRegistered` ticket → token marked inactive

**Fire-and-forget**: Push failures are logged (`console.warn`) but never throw or block the API response.

**Without `EXPO_PUBLIC_EAS_PROJECT_ID`**: Token registration is skipped silently (Expo Go development environment behavior).

---

## 12. Deep Links

Notifications include an `action` field containing a plain path:

| Event | Action Path |
|-------|------------|
| leave.* | `/leave` |
| overtime.* | `/overtime` |
| report.* | `/reports` |
| rating.task_assigned | `/rating` |
| finding.* | `/findings` |

**Security**:
- `action` field contains ONLY `/path` format — no query params with identity/auth data
- Target screen performs independent authorization (does not trust notification payload)
- If user has lost access, target returns 403/access denied

---

## 13. Privacy

All notification text uses generic, non-sensitive content from `NOTIFICATION_SAFE_TEXTS` in `lib/notifications/types.ts`.

| Good ✓ | Bad ✗ |
|--------|-------|
| "Ada pengajuan cuti yang memerlukan persetujuan Anda." | "Andi mengajukan cuti 3 hari karena sakit." |
| "Pengajuan cuti Anda telah disetujui." | "HR menyetujui cuti karena diagnosis medis." |
| "Ada laporan staf baru yang perlu ditinjau." | "Laporan: pelanggaran serius di gudang..." |

Full detail is revealed only after the user opens the resource with successful re-authorization.

---

## 14. Multi-device

Each device registers its own push token row in `push_tokens`. Multiple active tokens per user are fully supported.

**Scenario**: User with PC + Android A + Android B:
- PC: no push token (web session)
- Android A: `ExponentPushToken[tokenA]`, is_active=true
- Android B: `ExponentPushToken[tokenB]`, is_active=true
- Server sends to both active tokens when dispatching for this user

**Logout on Android A**: Only `tokenA` is deactivated. Android B session continues unaffected. Phase 22 multi-device session architecture is unchanged.

---

## 15. Security Tests

| Test | Result |
|------|--------|
| User A cannot read User B notifications | ✅ PASS — listRule/viewRule scoped to recipient |
| User A cannot mark User B read | ✅ PASS — server verifies recipient === ctx.userId before update |
| User A cannot create notification for User B | ✅ PASS — createRule = null (server admin only) |
| User cannot manipulate resource_id for unauthorized access | ✅ PASS — notification payload trusted only for navigation path; target re-authorizes |
| Non-HR/Owner users cannot receive leave.approve notifications | ✅ PASS — resolveCapabilityHolders filters by account_type/role_code |
| Invalid Expo push token rejected | ✅ PASS — isValidExpoPushToken() enforces format |
| Deep-link action cannot contain auth query params | ✅ PASS — unit test 13 |
| Privacy-safe payload (no sensitive data in text) | ✅ PASS — unit test 12 |

All 133 notification unit tests PASS.

---

## 16. Regression Tests

| Test Suite | Result |
|-----------|--------|
| `npm run test:mobile-capabilities` | ✅ 227/227 PASS |
| `npm run test:hr-rating-unit` | ✅ 24/24 PASS |
| `npm run test:hr-reporting-unit` | ✅ 5/5 PASS |
| `npm run test:hr-wave2-leave` | ✅ 12/12 PASS |
| `npm run test:notification-unit` | ✅ 133/133 PASS |
| `npx tsc --noEmit` (mobile) | ✅ 0 errors |
| `npx tsc --noEmit` (Next.js) | ✅ 0 new errors (14 pre-existing in Bisnis/WMS, documented in Phase 22) |

---

## 17. Changed Files

### New files
| File | Purpose |
|------|---------|
| `lib/notifications/types.ts` | Notification types, safe text registry |
| `lib/notifications/push.ts` | Expo push dispatch, token validation |
| `lib/notifications/recipients.ts` | RBAC-based recipient resolution |
| `lib/notifications/dispatch.ts` | Server-side notification creation + dispatch |
| `app/api/notifications/route.ts` | GET notifications (user-scoped) |
| `app/api/notifications/[id]/read/route.ts` | PATCH mark-as-read (owner-verified) |
| `app/api/push-tokens/route.ts` | POST register / DELETE deactivate token |
| `mobile/lib/notifications-api.ts` | Mobile client API calls |
| `mobile/app/notifications/index.tsx` | Notification center screen |
| `scripts/migrate-local-notifications-schema.mjs` | LOCAL PocketBase schema migration |
| `scripts/test-notification-unit.mjs` | 133 unit tests |
| `scripts/_check-local-collections.mjs` | Utility: inspect local PB collections |

### Modified files
| File | Change |
|------|--------|
| `mobile/lib/notifications.ts` | Add token server registration; add `erp-notifications` Android channel |
| `mobile/lib/work-dashboard-menu.ts` | Add "Notifikasi" tile to PERSONAL_TILES |
| `app/api/hr/leave/route.ts` | Fire-and-forget: notify approvers on leave submit |
| `app/api/hr/leave/[id]/approve/route.ts` | Fire-and-forget: notify requester on approval |
| `app/api/hr/leave/[id]/reject/route.ts` | Fire-and-forget: notify requester on rejection |
| `lib/hr/reporting-http.ts` | Fire-and-forget: notify HR reviewers on report submit |
| `package.json` | Add `test:notification-unit`, `test:hr-rating-unit`, `test:hr-reporting-unit`, `test:hr-leave-wave2` scripts |

---

## 18. Local Schema Changes

**Applied to LOCAL PocketBase at `http://127.0.0.1:8090` only.**

```
node scripts/migrate-local-notifications-schema.mjs
```

Output:
```
✓ PocketBase LOCAL healthy at http://127.0.0.1:8090
✓ Admin authenticated
✓ users collection id: _pb_users_auth_

── notifications ──
  [CREATE] notifications

── push_tokens ──
  [CREATE] push_tokens

✓ Phase 24 schema migration complete (LOCAL only)
```

Migration is **idempotent**: re-running only extends fields, never destroys existing data.

**Production/Staging**: UNTOUCHED. Schema migration script has explicit host guards that refuse to run against `pb.serba.space`, `:8091`, `:8092`, or `pb-staging`.

---

## 19. Production Safety

| Safety Check | Status |
|-------------|--------|
| Production schema | UNTOUCHED |
| Staging schema | UNTOUCHED |
| Production data | UNTOUCHED |
| Staging data | UNTOUCHED |
| Production rules | UNTOUCHED |
| Staging rules | UNTOUCHED |
| EAS build | NOT EXECUTED |
| APK build | NOT EXECUTED |
| Deploy | NOT EXECUTED |
| Migration on remote | NOT EXECUTED |
| commit/push | NOT EXECUTED |

All changes are LOCAL SOURCE ONLY.

---

## 20. APK UAT Preparation

Before building the Android APK for UAT (Phase 24E / next phase):

1. **Apply schema to staging**: Run `migrate-local-notifications-schema.mjs` adapted for staging host (requires Owner review and staging credentials).
2. **Set `EXPO_PUBLIC_EAS_PROJECT_ID`**: Required for `getExpoPushTokenAsync()` to return a real token.
3. **FCM credentials**: Ensure Expo project has FCM service account credentials for Android push delivery.
4. **EAS build**: `eas build --platform android --profile preview` (or UAT profile).

**Regression to verify on device**:
- Submit leave → HR/Owner receives in-app notification
- HR approves leave → Requester receives in-app notification
- Submit report → HR/Owner receives in-app notification
- Notification center shows, pull-to-refresh works
- Tap notification → navigates to correct screen
- Target screen re-authorizes (not just trusting payload)
- Logout → own device token deactivated, other devices unaffected

---

## 21. Final Decision

```
STATUS: READY FOR ANDROID APK UAT
```

### Pass criteria checklist

| Criterion | Status |
|-----------|--------|
| Phase 24A capability layer PASS | ✅ 227/227 |
| notifications collection safe (user-scoped rules) | ✅ |
| push_tokens collection safe (user-scoped rules) | ✅ |
| User isolation PASS | ✅ Unit test 4 |
| Recipient resolution follows RBAC/capability | ✅ Unit tests 2, 3 |
| Duplicate prevention (idempotency) PASS | ✅ Unit test 6 |
| Notification center PASS | ✅ Implemented |
| Deep-link authorization PASS | ✅ Unit test 13 |
| Mobile TypeScript PASS | ✅ 0 errors |
| Existing regression PASS | ✅ All suites |
| Local schema PASS | ✅ Applied to LOCAL |
| Production UNTOUCHED | ✅ |
| Staging UNTOUCHED | ✅ |
| No APK build | ✅ |
| No deployment | ✅ |

**Awaiting Owner review for Phase 24E — Android APK UAT.**

---

*End of Phase 24 Implementation Report.*
