# Phase 23 — Mobile RBAC & Notification Architecture

**Date:** 2026-08-28
**Mode:** AUDIT + DESIGN ONLY
**Scope:** Local source code analysis — Production, Staging, Schema, Build UNTOUCHED

---

## 1. Existing Roles

Roles are defined in `lib/auth-model.ts` and mirrored in `mobile/lib/rbac.ts`. There are **two dimensions** that together determine capability:

### Dimension A: `account_type`

| Value | Meaning | Source |
|---|---|---|
| `owner` | Full-access owner account. Bypasses all RBAC gates. | `lib/auth-model.ts` |
| `user` | Regular employee. Capability determined by `role_code`. | `lib/auth-model.ts` |

### Dimension B: `role_code` (only meaningful when `account_type = "user"`)

| `role_code` | Display Name | `dashboard_access` default | Source |
|---|---|---|---|
| `hr` | HR | true | `DASHBOARD_ROLES` in `auth-model.ts` |
| `manager` | Manager | true | `DASHBOARD_ROLES` |
| `staff` | Staff | true | `DASHBOARD_ROLES` |
| `staff-basic` | Staff Basic | true | `DASHBOARD_ROLES` |
| `security` | Security | false | (not in `DASHBOARD_ROLES`) |
| `ob` | OB (Office Boy) | false | (not in `DASHBOARD_ROLES`) |

`dashboard_access` can also be **explicitly overridden** per-user via `users.dashboard_access` bool field (added Phase 21).

### Legacy compatibility

Older records may have only `role = "owner"` or `role = "hr"` without `account_type`/`role_code`. `normalizeAuthModel()` handles this by reading `role` as fallback. **Both systems coexist safely.**

### Operational bypass

`hasOperationalBypass()` (`mobile/lib/operational-access-gate.ts`): `owner` and `hr` accounts access the Meja Kerja (Work) module **without requiring check-in** (`web_access = true`). All other roles require the attendance check-in gate.

---

## 2. Existing Permissions

Permissions are expressed as **path-based RBAC** (`canAccess(user, pathname)`), not a granular permission object. Source: `mobile/lib/rbac.ts` and `lib/rbac.ts`.

### Web (Next.js) path → role mapping

| Path | owner | hr | manager | staff | staff-basic | security | ob |
|---|---|---|---|---|---|---|---|
| `*` (all) | ✅ | — | — | — | — | — | — |
| `/hr` and sub-paths | — | ✅ | — | — | — | — | — |
| `/hr/rating` | — | ✅ | — | — | — | — | — |
| `/hr/findings` | — | ✅ | — | — | — | — | — |
| `/dashboard-staff` | — | ✅ | ✅ | ✅ | ✅ | — | — |
| `/profile` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/inventory` | per `canAccessInventory` | per `canAccessInventory` | per `canAccessInventory` | per `canAccessInventory` | per `canAccessInventory` | per `canAccessInventory` | per `canAccessInventory` |

### API-level authorization (server-side)

All HR mutation endpoints (`/api/hr/*`) call `getHrApiAuthContext()` on the server:

```
Mobile → Authorization: Bearer <pb_token> → Next.js API
→ getHrApiAuthContext() verifies token against PocketBase
→ resolves ctx.isOwner / ctx.isHr / ctx.companyIds
→ business logic applies authorization
→ adminPb executes mutation
```

**API authorization is server-enforced**, not just UI-gated. Examples:
- `POST /api/hr/leave/:id/approve` — requires `ctx.isOwner || ctx.isHr`
- `POST /api/hr/findings` — requires `ctx.isOwner || ctx.isHr`
- `GET /api/hr/rating/my-tasks` — any authenticated user (returns only their tasks)
- `POST /api/hr/rating/tasks/:id (submit)` — requires `row.reviewer === ctx.userId`

### Technical debt — direct PocketBase reads (mobile)

`mobile/lib/leave.ts` reads `leave_requests` **directly** from PocketBase SDK (bypassing Next.js API) for listing/history. Protection relies on PocketBase `listRule`:

```
listRule: "@request.auth.id != \"\" && (user = @request.auth.id || @request.auth.role = \"hr\" || ...)"
```

This is **protected at PocketBase level** but represents a dual-protection pattern (PB rules for reads, Next.js API for writes). Documented as tech debt in section 15.

---

## 3. Mobile Capability Matrix

### A. Common Employee Capabilities (all authenticated users)

| Module | Screen | VIEW | CREATE | UPDATE | APPROVE | DELETE | Implementation Status |
|---|---|---|---|---|---|---|---|
| Attendance (Check-in/out) | `(tabs)/attendance` | ✅ | ✅ | — | — | — | EXISTS |
| GPS location capture | embedded in attendance | ✅ | ✅ | — | — | — | EXISTS |
| Leave request (submit) | `(tabs)/leave` (href=null, navigated via attendance tab) | ✅ | ✅ | — | — | ✅ (own) | EXISTS |
| Overtime (submit) | `(tabs)/overtime` (href=null) | ✅ | ✅ | — | — | — | EXISTS |
| Field activity (submit) | `(tabs)/field` (href=null) | ✅ | ✅ | — | — | — | EXISTS |
| Payroll slip view | `(tabs)/payroll` (href=null) | ✅ | — | — | — | — | EXISTS |
| Profile | `(tabs)/profile` | ✅ | — | ✅ (own) | — | — | EXISTS |
| Rating (reviewer tasks) | `(tabs)/rating` | ✅ | — | ✅ (draft) | — | — | EXISTS |
| Rating (my result) | `(tabs)/rating` | ✅ | — | — | — | — | EXISTS |
| Staff Reports (Laporan) | `reports/` | ✅ | ✅ | ✅ (draft own) | — | — | EXISTS |
| Meja Kerja tab | `(tabs)/kerja` | ✅ | — | — | — | — | EXISTS (all users) |

### B. HR & Owner Native Capabilities

| Module | Screen | VIEW | CREATE | UPDATE | APPROVE | DELETE | Status |
|---|---|---|---|---|---|---|---|
| Leave approval queue | `hr/leave-queue` | ✅ | — | — | ✅ approve/reject | — | EXISTS |
| Overtime queue | `hr/overtime-queue` | ✅ | ✅ (assign) | — | ✅ approve/reject | — | EXISTS |
| Field activity queue | `hr/field-queue` | ✅ | — | — | ✅ approve/reject | — | EXISTS |
| HR Findings (create) | `findings/` | ✅ | ✅ | ✅ (draft) | — | — | EXISTS |
| HR Findings (list) | `findings/index` | ✅ | — | — | — | — | EXISTS |
| Attachment upload (findings) | `findings/[id]` | ✅ | ✅ | — | — | ✅ | EXISTS |
| Rating management (HR/Owner) | via web only | — | — | — | — | — | WEB-ONLY / FUTURE mobile |
| Rating period management | via web only | — | — | — | — | — | WEB-ONLY |
| Employee management | via web only | — | — | — | — | — | WEB-ONLY |
| Payroll processing | via web only | — | — | — | — | — | WEB-ONLY |
| System configuration | via web only | — | — | — | — | — | WEB-ONLY |

### C. Warehouse / Inventory Native Capabilities

Access gate: `canAccessInventory(user)` (separate lib, path-based)

| Module | Screen | Status |
|---|---|---|
| Inventory hub | `inventory/index` | EXISTS |
| Zone scan (QR) | `inventory/zone-scan` | EXISTS |
| Product scan (barcode) | `inventory/product-scan` | EXISTS |
| Packing checklist | `inventory/packing` | EXISTS |
| Stock opname | `inventory/opname` | EXISTS |
| Movement (draft in/out) | `inventory/movement-new` | EXISTS |
| WMS workstation scan | `wms/workstation-scan` | EXISTS |
| WMS receiving / QC / picking | — | NOT IMPLEMENTED (mobile) |
| Warehouse approval | — | FUTURE |

### D. Accounting / Finance Mobile Capabilities

| Module | Status |
|---|---|
| Transaction approval (mobile) | NOT IMPLEMENTED |
| Invoice verification (mobile) | NOT IMPLEMENTED |
| Payment status review (mobile) | NOT IMPLEMENTED |
| Laba-rugi / reporting (mobile) | NOT IMPLEMENTED |
| Kas-bank (mobile) | NOT IMPLEMENTED |

**Note:** Accounting/Finance (keuangan, bisnis) modules exist only in the web dashboard. No mobile screens have been built for these. Status: **FUTURE** for all accounting mobile capabilities.

---

## 4. Role → Permission → Capability Model

### Current model (as-is)

```
user.account_type + user.role_code
       ↓
normalizeAuthModel()
       ↓
AuthModel { accountType, roleCode, dashboardAccess }
       ↓
canAccess(user, "/path")  ←  ROLE_ACCESS_BY_CODE[roleCode]
       ↓
UI visibility gate
```

### API authorization (server-side, independent of UI)

```
Mobile request + Bearer token
       ↓
Next.js API → getHrApiAuthContext(req)
       ↓
{ isOwner, isHr, userId, companyIds, user }
       ↓
Business logic checks (ctx.isOwner || ctx.isHr || userId match)
       ↓
adminPb executes or HrApiError(403)
```

### Desired model (Phase 24 target)

```
Role → Permissions (declarative) → Capabilities → Mobile Navigation
```

Example:
```ts
const PERMISSIONS = {
  "leave.submit":   ["owner","hr","manager","staff","staff-basic"],
  "leave.approve":  ["owner","hr"],
  "rating.review":  ["*"],  // any assigned reviewer
  "finding.create": ["owner","hr"],
  "report.create":  ["*"],  // any authenticated user
  "inventory.access": per canAccessInventory()
};
```

Mobile navigation sections auto-render based on which permissions the current user holds, rather than hard-coded `if roleCode === "hr"` checks.

---

## 5. Existing Mobile Features

### Tab navigation structure (`mobile/app/(tabs)/_layout.tsx`)

| Tab | `href` | Visible | Condition |
|---|---|---|---|
| Absensi | always | ✅ | All authenticated users |
| Meja Kerja | controlled | ✅ | `shouldShowMejaKerjaTab(user)` = always true when logged in |
| Rating | always | ✅ | All authenticated users |
| Cuti | `null` | Hidden from tab bar | Navigated from attendance tab |
| Lembur | `null` | Hidden from tab bar | Navigated from attendance tab |
| Luar kantor | `null` | Hidden from tab bar | Navigated from attendance tab |
| Slip gaji | `null` | Hidden from tab bar | Navigated from profile |
| Profil | always | ✅ | All authenticated users |

### Stack navigation (non-tab)

| Stack | Routes | Access |
|---|---|---|
| `hr/` | `leave-queue`, `overtime-queue`, `field-queue` | Only shown if `canAccessHrNativeModule(user)` |
| `reports/` | `index`, `new`, `[id]` | All authenticated (personal reports) |
| `findings/` | `index`, `new`, `[id]` | Navigated from HR queue (HR/Owner only) |
| `inventory/` | `index`, `zone-scan`, `product-scan`, `packing`, `opname`, `movement-new` | `canAccessInventory(user)` |
| `wms/` | `workstation-scan` | `canAccessInventory(user)` |

---

## 6. Desktop vs Mobile Capability

### MOBILE-FIRST (native, camera, GPS, quick-action)

| Capability | Reason |
|---|---|
| Attendance check-in / check-out | GPS + camera, on-field use |
| Leave request submit (calendar) | Touch calendar → one tap submit |
| Overtime submit | Quick form, field-use |
| Field activity submit | GPS context |
| Rating review & submit | Personal reviewer task — mobile-convenient |
| Leave/Overtime/Field approval queue | Quick approve/reject without opening laptop |
| Finding create (HR on-site) | Camera evidence capture on-site |
| Report create (staff) | Camera evidence + form |
| QR/barcode scan (warehouse) | Hardware camera scan |
| Zone check-in (warehouse) | Physical zone scan |

### DESKTOP-FIRST (complex data, bulk operation)

| Capability | Reason |
|---|---|
| Payroll processing | Complex calculation, large table |
| Employee management | Multi-field forms, large dataset |
| HR rating period management | Bulk assignment, complex config |
| Rating result analytics | Charts, export |
| System configuration | Admin-level, rare |
| Accounting (kas, laba-rugi, invoice) | Complex tabular data, multi-filter |
| WMS QC / picking / packing workflow | Multi-step, complex UX |
| Bulk attendance correction | Table-heavy |
| GPS history audit | Map, timeline |

### HYBRID (exists on both, different UX)

| Capability | Web UX | Mobile UX |
|---|---|---|
| Rating (reviewer task) | Full web page | Swipe through aspects, tap score |
| Rating (my result) | Dashboard card | Simple score card |
| Leave history | Table with filters | Scroll list with calendar overlay |
| Staff reports list | Paginated table | Pull-to-refresh scroll |
| Findings list | Table with search | HR-only scroll list |
| Payroll slip | Download PDF | View-only summary |

---

## 7. Existing Notification Infrastructure

| Component | Status | Location |
|---|---|---|
| `expo-notifications` library | EXISTS | `mobile/lib/notifications.ts` |
| Permission request (`requestPermissionsAsync`) | EXISTS | `mobile/lib/notifications.ts:43` |
| Android notification channel "default" | EXISTS | `mobile/lib/notifications.ts:49` |
| `setNotificationHandler` (foreground alerts) | EXISTS | `mobile/lib/notifications.ts:9` |
| `usePushRegistration` hook | EXISTS | `mobile/lib/notifications.ts:29` |
| Expo push token retrieval | PARTIAL | Only if `EXPO_PUBLIC_EAS_PROJECT_ID` env is set; token is obtained but **not stored** |
| Push token stored in PocketBase | NOT IMPLEMENTED | No `push_token` field in `users` collection |
| In-app notification center | NOT IMPLEMENTED | No screen, no collection |
| Notification unread count / badge | NOT IMPLEMENTED | — |
| Notification history / persistence | NOT IMPLEMENTED | — |
| Push notification deep link handling | NOT IMPLEMENTED | — |
| Notification preferences (per-user) | NOT IMPLEMENTED | — |
| Server-side push dispatch | NOT IMPLEMENTED | No server code for Expo Push API calls |
| Recipient resolution engine | NOT IMPLEMENTED | — |
| Notification collection (PocketBase) | NOT IMPLEMENTED | No `notifications` or `push_tokens` collection |
| FCM / APNs integration | NOT IMPLEMENTED | Expo SDK present; FCM keys not configured |

**Summary:** The project has the **client-side scaffolding** for push notifications (permission request, Android channel, token fetch) but **zero server-side infrastructure** to send, route, or track notifications.

---

## 8. Notification Event Matrix

Events that already exist in business logic and warrant notifications:

| # | Event | Source Module | Creator | Recipient Rule | Mobile Action | Status |
|---|---|---|---|---|---|---|
| 1 | Staff submits leave | `serverSubmitLeave` / `mobileSubmitLeave` | Any staff | Users with `leave.approve` permission (HR/Owner in same company scope) | Open leave approval queue | NOT IMPLEMENTED |
| 2 | Leave approved by HR | `serverApproveLeave` | HR/Owner | Leave requester (the staff) | Open own leave detail | NOT IMPLEMENTED |
| 3 | Leave rejected by HR | `serverRejectLeave` | HR/Owner | Leave requester | Open own leave detail with rejection reason | NOT IMPLEMENTED |
| 4 | Staff cancels leave | `serverCancelLeave` | Staff | HR/Owner (informational) | Informational only | NOT IMPLEMENTED |
| 5 | Staff submits overtime | overtime server | Any staff | HR/Owner in company scope | Open overtime approval queue | NOT IMPLEMENTED |
| 6 | Overtime approved | overtime server | HR/Owner | Staff | Informational | NOT IMPLEMENTED |
| 7 | Overtime rejected | overtime server | HR/Owner | Staff | Informational | NOT IMPLEMENTED |
| 8 | Staff submits field activity | field-activity server | Any staff | HR/Owner | Open field queue | NOT IMPLEMENTED |
| 9 | Field activity approved/rejected | field server | HR/Owner | Staff | Informational | NOT IMPLEMENTED |
| 10 | Rating reviewer assigned | `serverCreateAssignment` | HR/Owner | Assigned reviewers (from `hr_rating_reviewers`) | Open rating task | NOT IMPLEMENTED |
| 11 | Rating submitted by reviewer | `serverSubmitReviewer` | Reviewer | HR/Owner | Update dashboard | NOT IMPLEMENTED |
| 12 | Rating result calculated | `recalculateAssignmentResult` | System | Subject (if result is complete) | View my result | NOT IMPLEMENTED |
| 13 | Staff creates report | `serverCreateCase("report")` | Any staff | HR/Owner in company scope | View report queue | NOT IMPLEMENTED |
| 14 | Staff submits report | `serverSubmitCase("report")` | Staff | HR/Owner in company scope | Open report detail | NOT IMPLEMENTED |
| 15 | HR creates finding | `serverCreateCase("finding")` | HR/Owner | HR/Owner in company scope (peer review) | View finding | NOT IMPLEMENTED |
| 16 | Report/Finding closed | `serverCloseCase` | HR/Owner | Report creator (if report kind) | Informational | NOT IMPLEMENTED |
| 17 | Warehouse task assigned | WMS workflow | Warehouse mgr | Assigned warehouse user | Open WMS task | FUTURE (no mobile WMS task assign yet) |
| 18 | Accounting document requires action | Finance server | Finance manager | Authorized accounting user | FUTURE | FUTURE |

---

## 9. Notification Recipient Resolution

### Design principle

Notifications must target the **authorized account**, not hard-coded role labels. Resolution must be dynamic, based on RBAC + company scope.

### Resolution algorithm (not yet implemented)

```
Event fired: leave_submitted (leave_id, by_user_id)
  ↓
1. Determine resource: leave_requests[leave_id]
2. Determine company scope: biz_user_companies[by_user_id] → company_ids[]
3. Resolve authorized recipients:
   users WHERE (account_type=owner)
   OR (role_code=hr AND company ∈ company_ids via biz_user_companies)
4. For each recipient:
   - Lookup stored push_token (not yet in schema)
   - Call Expo Push API: send push to token
   - Create in-app notification record
```

### Per-event recipient rules

| Event | Recipient Resolution |
|---|---|
| Leave submitted | HR + Owner with company_scope overlap |
| Leave approved/rejected | `leave_requests[id].user` (the requester) |
| Rating task assigned | `hr_rating_reviewers[assignment_id].reviewer` (each assigned reviewer) |
| Rating result complete | `hr_rating_assignments[id].subject` (the rated employee) |
| Report submitted | HR + Owner with company_scope overlap |
| Finding created | HR + Owner (always company-scoped) |
| Report/Finding closed | `hr_staff_reports[id].created_by` / `hr_findings[id].created_by` |

### Important: No "notify every HR" pattern

Recipient resolution must use company scope (`biz_user_companies`) to ensure cross-entity HR isolation — the same principle as `assertSubjectInActorScope()` and `assertHrLeaveSubjectInScope()` in server code.

---

## 10. Notification RBAC Security

### API endpoint protection (existing, correct)

All sensitive data mutations behind `/api/hr/*` are server-authorized. Even if a mobile client attempts a direct call with a forged Authorization token, PocketBase rejects auth for non-matching tokens. If a valid token of an unauthorized role is used, `getHrApiAuthContext()` returns `isHr=false` and the endpoint throws `HrApiError(403)`.

### Notification-specific security design

**Rule:** A notification must NEVER bypass authorization for the underlying resource.

```
User receives notification: "Ada laporan baru"
  → Taps notification → deep link → reports/:id
  → Mobile fetches: GET /api/hr/reports/:id
  → Server: getHrApiAuthContext() → canViewCase() check
  → If no longer authorized: 403 → show "Akses tidak tersedia"
  → Never show data directly from notification payload
```

**Sensitive data must NOT appear in notification body.** The notification payload should contain only:
- Opaque event identifier
- Generic message text
- Resource type and ID (for deep link only)

---

## 11. Multi-Device Design

### Current session design (verified Phase 22)

| Device | Auth storage | Session independence |
|---|---|---|
| PC (web browser) | PocketBase JWT in browser cookie/memory | Independent — web never writes `mobile_session_nonce` |
| Android device A | Expo `SecureStore` (key: `pb_auth`) | Independent PB token |
| Android device B | Expo `SecureStore` (key: `pb_auth`) | Writes new `mobile_session_nonce` → auto-logs out device A |

**PC + Android coexist.** Two Android devices for the same account → only the most recent one remains active (nonce design).

### Notification targeting — multi-device

Notifications should target **the user (account)**, not a specific device. A user may have multiple registered push tokens (if implemented).

**Design:**

```
users collection
  → one-to-many push_tokens (future collection)
     push_tokens { user, token, platform, device_label, created, last_seen }

Notification dispatch:
  For each recipient_user_id:
    tokens = push_tokens WHERE user = recipient_user_id
    For each token:
      POST Expo Push API { to: token, ... }
```

**Web (PC):** Web sessions do not receive push notifications (no FCM token). In-app notification center in the web dashboard is a separate FUTURE concern.

**If user has no push token registered:** Notification is queued for in-app notification center only (when implemented). No push is sent.

---

## 12. Notification Privacy

### Principle: Zero sensitive data in notification payload

| Category | BAD (must NOT send) | GOOD (safe to send) |
|---|---|---|
| Leave | "Andi mengajukan cuti tanggal 2026-09-01 karena sakit" | "Ada pengajuan cuti baru yang menunggu persetujuan." |
| Finding | "HR menemukan pelanggaran oleh Budi di area gudang" | "Ada temuan baru yang memerlukan perhatian Anda." |
| Rating | "Reviewer Citra memberikan skor 2/5 untuk Anda" | "Hasil penilaian Anda telah tersedia." |
| Report | "Laporan dari Dedi: fasilitas rusak di lantai 2" | "Ada laporan baru yang memerlukan tindak lanjut." |
| Payroll | "Slip gaji bulan ini: Rp 8.500.000" | "Slip gaji bulan ini sudah tersedia." |
| Rejection | "Cuti Anda ditolak karena: alasan pribadi HR" | "Pengajuan cuti Anda telah diproses." |

### Deep link authorization (after tap)

```
Notification tapped → deep link → resource screen
  ↓
Mobile: GET /api/hr/reports/:id (with user token)
  ↓
Server: authorization check
  ↓
  authorized → show data
  unauthorized → "Konten ini tidak dapat ditampilkan untuk akun Anda."
  resource deleted → "Konten tidak lagi tersedia."
```

---

## 13. Notification UX

### Notification Center concept (FUTURE — not to be built in Phase 23)

```
🔔 Notifikasi  [3 belum dibaca]

──────────────────────────────────────
 📅  Cuti disetujui                 2j
     Pengajuan cuti Anda telah diproses.
     Tap untuk melihat detail.

──────────────────────────────────────
 ⭐  Tugas penilaian baru           1h
     Anda mendapat tugas penilaian.
     Tap untuk mulai.

──────────────────────────────────────
 📋  Laporan memerlukan tindak lanjut  30m
     Ada laporan baru di antrean Anda.
     Tap untuk melihat.

──────────────────────────────────────
 [Lihat semua]

```

### Deep link map (FUTURE)

| Notification type | Deep link target | Authorization required |
|---|---|---|
| Leave approved/rejected | `/(tabs)/leave` → own leave detail | Own record |
| Rating task assigned | `/(tabs)/rating` → task detail | `reviewer === user.id` |
| Rating result available | `/(tabs)/rating` → my result | `assignment.subject === user.id` |
| Report/Finding pending | `/hr/leave-queue` or `/reports/:id` | HR/Owner scope |
| Overtime assigned | `/(tabs)/overtime` or `/hr/overtime-queue` | HR/Owner or own record |

### Push notification behavior

| State | Behavior |
|---|---|
| App in foreground | In-app banner (via `setNotificationHandler`) |
| App in background | Android system notification |
| App closed | Android system notification |
| User taps notification | Deep link to relevant screen |
| Authorization fails on deep link | Access denied screen — data never shown |

---

## 14. Future Role Extensibility

### Current pattern (technical debt)

Hard-coded role checks exist in multiple places:

```ts
// mobile/lib/work-dashboard-menu.ts
export function isHrOrOwnerAccount(user) {
  return auth.accountType === "owner" || auth.roleCode === "hr";
}
// mobile/lib/hr-native-access.ts
export function canAccessHrNativeModule(user) {
  return canAccess(user, "/hr");  // better — path-based
}
```

Adding a new role (e.g., `supervisor`) currently requires:
1. Adding to `UserRoleCode` type in `auth-model.ts`
2. Adding to `ROLE_ACCESS_BY_CODE` in `rbac.ts` AND `mobile/lib/rbac.ts` (duplicated!)
3. Potentially updating every `isHrOrOwnerAccount` call site
4. Updating `getHrNativeWorkTiles` if the new role needs queue access
5. Updating API authorization checks

### Desired extensibility model (Phase 24 target)

```ts
// Single source of truth permission registry
const CAPABILITY_PERMISSIONS = {
  "leave.submit":    ["owner","hr","manager","staff","staff-basic","security","ob"],
  "leave.approve":   ["owner","hr"],
  "rating.review":   "*",  // dynamic: only if assigned reviewer_row exists
  "finding.create":  ["owner","hr"],
  "report.create":   "*",  // all authenticated
  "inventory.access": "*", // gated by canAccessInventory (separate dimension)
  "hr.queue.access": ["owner","hr"],
  "overtime.submit": ["owner","hr","manager","staff","staff-basic"],
  "overtime.approve":["owner","hr"],
} as const;

function hasCapability(user: AuthUser, capability: keyof typeof CAPABILITY_PERMISSIONS): boolean {
  const allowed = CAPABILITY_PERMISSIONS[capability];
  if (allowed === "*") return !!user;
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  return auth.roleCode ? allowed.includes(auth.roleCode) : false;
}
```

Mobile navigation sections render dynamically:
```
buildMobileNavigation(user)
  → filter PERSONAL_TILES by hasCapability
  → filter WORK_TILES by hasCapability
  → filter HR_TILES by hasCapability
  → render
```

Adding a new role → only update `CAPABILITY_PERMISSIONS` and `UserRoleCode`. No screen-level code changes needed.

---

## 15. Existing Technical Debt

| # | Debt | Location | Severity | Phase 24 action |
|---|---|---|---|---|
| T1 | **Duplicated RBAC code** — `lib/rbac.ts` and `mobile/lib/rbac.ts` are nearly identical but maintained separately. Divergence risk is high. | `lib/rbac.ts`, `mobile/lib/rbac.ts` | HIGH | Unify into shared package or single source |
| T2 | **Hard-coded role checks** — `isHrOrOwnerAccount` checks `roleCode === "hr"` directly instead of capability-based lookup. Adding new roles that should have approval access requires code changes. | `mobile/lib/work-dashboard-menu.ts:233` | MEDIUM | Replace with `hasCapability("hr.queue.access", user)` |
| T3 | **Push token not persisted** — `usePushRegistration` fetches Expo token but never stores it in PocketBase. No server-side push dispatch is possible without this. | `mobile/lib/notifications.ts:56` | HIGH | Add `push_tokens` collection; store token on registration |
| T4 | **No in-app notification infrastructure** — Zero notification collection, unread count, or history. | — | HIGH | Requires new collection + UI |
| T5 | **Direct PocketBase reads in mobile leave** — `mobile/lib/leave.ts` queries PocketBase directly for leave history, bypassing Next.js API. This means leave read authorization depends on PocketBase rules alone, not server business logic. | `mobile/lib/leave.ts` | LOW-MEDIUM | Migrate to `/api/hr/leave` endpoint for consistency |
| T6 | **`EXPO_PUBLIC_EAS_PROJECT_ID` not documented in `.env.example`** — Push token fetch silently skips when projectId is missing, providing no error/warning. | `mobile/.env.example` | LOW | Add to example + docs |
| T7 | **No notification deep link handler** — `useLastNotificationResponse` from expo-notifications not connected to router navigation. | — | MEDIUM | Add in root `_layout.tsx` |
| T8 | **`mobile/lib/rbac.ts` has fewer routes than `lib/rbac.ts`** — `/hr/rating`, `/hr/findings`, `/laporan`, `/pengaturan`, inventory paths are missing from mobile rbac KNOWN_ROUTES. | `mobile/lib/rbac.ts:156` | LOW | Sync KNOWN_ROUTES |
| T9 | **No notification preferences** — Users cannot control which events generate notifications. | — | LOW | Add `notification_preferences` field or collection in future |
| T10 | **`findings` screen has no auth gate at navigation level** — Both `reports/` and `findings/` are navigable from work dashboard, but only `findings` should be restricted to HR/Owner. Current implementation shows tiles only for HR/Owner (`getHrNativeWorkTiles`), but deep-linking `/findings` URL is not explicitly blocked at router level. API is protected. | `mobile/app/findings/` | MEDIUM | Add auth guard in `findings/_layout.tsx` |

---

## 16. Recommended Phase 24 Implementation Plan

Ordered by dependency and impact:

### Priority 1: Push Token Storage (prerequisite for all push)

1. Add `push_tokens` collection to PocketBase schema (local + Production via migration):
   - Fields: `user` (relation→users), `token` (text), `platform` (select: android/ios), `device_label` (text), `last_seen` (date)
   - Rules: user can write own token, admin can read all
2. Update `usePushRegistration` to POST token to `/api/mobile/push-token` after obtaining it
3. Server endpoint stores token in `push_tokens` collection via adminPb

### Priority 2: In-App Notification Collection (prerequisite for center)

Add `notifications` collection:
- Fields: `recipient` (relation→users), `event_code` (text), `title` (text), `body` (text), `resource_type` (text), `resource_id` (text), `is_read` (bool), `created` (auto)
- Rules: `listRule/viewRule = user.id = @request.auth.id`, others null

### Priority 3: Notification Center UI

- Add notification bell icon to tab bar or header
- Unread count badge
- Notification center screen (list of `notifications` for current user)
- Mark as read
- Deep link tap handler in `_layout.tsx`

### Priority 4: Server-Side Event Emitters

Wire `emitBusinessEventServer` calls to also create notification records and send push:
- Leave submitted → notify HR/Owner in scope
- Leave approved/rejected → notify staff
- Rating task assigned → notify reviewer
- Report submitted → notify HR/Owner in scope

### Priority 5: Notification Preferences

Add `notification_preferences` to `profiles` or as JSON field in `users`. Allow per-user opt-out of specific event types.

### Priority 6: Capability-based RBAC refactor

Replace hard-coded role checks with `hasCapability()`. Unify `lib/rbac.ts` and `mobile/lib/rbac.ts`.

---

## 17. Production Impact

| Item | Status |
|---|---|
| Production | **UNTOUCHED** |
| Staging | **UNTOUCHED** |
| Schema | **UNCHANGED** |
| Business Logic | **UNCHANGED** |
| API routes | **UNCHANGED** |
| Mobile Build | **NOT CREATED** |
| New collections | **NONE** |
| Migration executed | **NONE** |

---

## Final Decision

```
READY FOR PHASE 24 IMPLEMENTATION
```

### Summary

The architecture audit is complete. The project has:

- ✅ **RBAC foundations** — role system (`account_type` + `role_code`) is well-defined and server-enforced at API level
- ✅ **Mobile capability routing** — path-based `canAccess()` gates UI navigation
- ✅ **Notification client scaffolding** — permission request + Android channel + token fetch already implemented
- ✅ **Business events** — `emitBusinessEventServer` is called at all key workflow transitions
- ⚠️ **Push token not persisted** — critical gap before any notification can be sent
- ⚠️ **No notification center** — zero in-app notification UI or data layer
- ⚠️ **Duplicated RBAC** — `lib/rbac.ts` and `mobile/lib/rbac.ts` divergence risk
- ⚠️ **Hard-coded role checks** — limit extensibility

Phase 24 may implement notification infrastructure (push_tokens, notifications collection, center UI, server dispatch) and capability-based RBAC refactor without touching existing Production application behavior.
