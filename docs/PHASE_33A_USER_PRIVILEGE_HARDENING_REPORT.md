# Phase 33A — User Privilege & Account Security Hardening

**Date:** 2026-08-31  
**Mode:** LOCAL IMPLEMENTATION ONLY  
**Status:** COMPLETE (local)

---

## PHASE 33A STATUS

| Item | Status |
|------|--------|
| **Phase 33A** | **COMPLETE (local)** |
| **Production** | **UNTOUCHED** |
| **Staging** | **UNTOUCHED** |
| **APK** | **NOT BUILT** |
| **Local** | **IMPLEMENTED + TESTED** |

---

## 1. Root Cause

Phase 32 hardened **`profiles.updateRule`** (self must use `/api/profile/self`), but **`users.updateRule`** still allowed:

```
@request.auth.id = id || HR_OR_OWNER
```

Any authenticated user could PATCH their own `users` record and escalate privilege by setting:

- `role`, `role_code`, `account_type`
- `dashboard_access`, `status`, `inventory_role`, `hr_role_preset`
- `web_access`, company scope fields (`active_company`, …)
- operational flags (`is_checked_in`, `shift_active`, …)

HR could also mutate **other users** directly via PocketBase client, bypassing server capability checks and audit.

---

## 2. PocketBase Rule — Before / After

### `users.updateRule`

| | Expression |
|---|------------|
| **Before** | `@request.auth.id != "" && (@request.auth.id = id \|\| HR_OR_OWNER)` |
| **After** | Self may patch **only** `session_nonce` / `mobile_session_nonce` (privilege + password fields blocked via `:isset = false`). **Owner** retains full client update. **HR/staff** cannot client-update any user (including others). |

**Apply locally:** `npm run migrate:local-hr-phase33a`

Rule builder: `scripts/pb-user-privilege-rule.mjs` + `lib/hr/user-privilege-fields.ts`

**Note:** Denied self-updates return HTTP **404** from PocketBase (not 403) when privilege fields are present — treated as blocked in tests.

---

## 3. API Changes

| Endpoint | Purpose |
|----------|---------|
| `POST /api/profile/self/password` | Self password change (verify old password via PB auth, update via admin PB) |
| `POST /api/auth/session/web` | Rotate `session_nonce` (admin PB, authenticated user) |
| `POST /api/auth/session/mobile` | Rotate `mobile_session_nonce` (admin PB, authenticated user) |

### Existing server-authoritative paths (unchanged, verified)

| Path | Notes |
|------|-------|
| `PATCH /api/hr/employees/[id]` | Role, dashboard_access, profile — admin PB + capability + audit |
| `POST /api/hr/employees/[id]/activate` | Owner-only capability |
| `POST /api/hr/employees/[id]/deactivate` | Owner-only capability |
| `POST /api/user/locale` | Admin PB |
| `POST /api/tenant/work-context` | Admin PB + company access check |
| `POST /api/auth/reset-password` | Token-verified admin PB update |

### Client routing updates

| Client | Change |
|--------|--------|
| `components/EmployeeSelfProfile.tsx` | Password → `/api/profile/self/password` |
| `mobile/app/(tabs)/profile.tsx` | Password → ERP `/api/profile/self/password` via `mobile/lib/session-api.ts` |
| `lib/auth-session.ts` | Web session nonce → `/api/auth/session/web` (PB fallback for legacy) |
| `mobile/lib/auth-session.ts` | Mobile session nonce → `/api/auth/session/mobile` (PB fallback) |
| `lib/hr/attendance-server.ts` | Operational flags → `operational-access-server.ts` (admin PB) |

### `rejectClientPrivilegeFields` expanded

Now rejects: `dashboard_access`, `status`, `inventory_role`, `hr_role_preset`, `web_access`, company/store/warehouse scope, operational flags, `locale`, session nonces, password fields.

---

## 4. Privilege Matrix (users collection)

| Field group | Self PB client | HR PB client | Owner PB client | Server API |
|-------------|----------------|--------------|-----------------|------------|
| `session_nonce`, `mobile_session_nonce` | ✅ | ❌ | ✅ | ✅ `/api/auth/session/*` |
| Password | ❌ | ❌ | ✅ | ✅ `/api/profile/self/password` |
| `role`, `role_code`, `account_type` | ❌ | ❌ | ✅ | ✅ HR employee API (authorized) |
| `dashboard_access`, `inventory_role`, `hr_role_preset` | ❌ | ❌ | ✅ | ✅ HR employee API |
| `status` (activate/deactivate) | ❌ | ❌ | ✅ | ✅ activate/deactivate API |
| Company / store / warehouse scope | ❌ | ❌ | ✅ | ✅ work-context / company-access |
| Operational (`is_checked_in`, `web_access`, …) | ❌ | ❌ | ✅ | ✅ attendance-server (admin PB) |
| `locale` | ❌ | ❌ | ✅ | ✅ `/api/user/locale` |

Employee capability matrix (unchanged): `lib/capabilities/web-access.ts` → `EMPLOYEE_CAPABILITY_MATRIX`.

---

## 5. Security Tests (Phase 33A)

**Run:** `npm run test:phase33a-user-privilege`

| Test | Result |
|------|--------|
| Staff cannot change own `role` / `role_code` | PASS (live PB) |
| Staff cannot grant `dashboard_access` | PASS |
| Staff cannot change `account_type` / `status` | PASS |
| Staff cannot change password via PB client | PASS |
| Staff **can** rotate `session_nonce` | PASS |
| HR cannot elevate own role | PASS |
| HR cannot deactivate another user via PB | PASS |
| HR cannot modify company scope via PB | PASS |
| Manager cannot elevate privilege (logic) | PASS |
| HR cannot grant `employee.manage_hr_accounts` | PASS |
| Owner authorized operations (positive) | PASS |
| API body privilege rejection | PASS |
| `users.updateRule` matches Phase 33A | PASS |

**Total: 37/37 PASS**

---

## 6. Regression Tests

| Suite | Result |
|-------|--------|
| Phase 31 (`test:phase31-employee-rbac`) | **32/32 PASS** |
| Phase 32 (`test:phase32-rbac-hardening`) | **35/35 PASS** |
| Mobile capabilities | **227/227 PASS** |
| Notification unit | **133/133 PASS** |
| HR Rating unit | **24/24 PASS** |
| HR Reporting unit | **5/5 PASS** |
| HR Leave Wave 2 | **12/12 PASS** |
| TypeScript (`tsc --noEmit`) | **PASS** |

Attendance: covered via HR attendance server refactor + mobile API path (no dedicated attendance unit script in `package.json`).

---

## 7. Audit Events

Privilege mutations via HR employee APIs continue to emit (metadata only — no passwords/tokens):

| Event | When |
|-------|------|
| `employee.role_changed` | Role preset change |
| `employee.access_changed` | `dashboard_access` change |
| `employee.activated` | Status → active |
| `employee.deactivated` | Status → inactive |

---

## 8. Schema Changes

| Change | Production |
|--------|------------|
| **None** | **NOT migrated** |

Local-only PocketBase rule change via `migrate:local-hr-phase33a`.

---

## 9. Files Changed

### New

| File | Purpose |
|------|---------|
| `lib/hr/user-privilege-fields.ts` | Privilege field list + PB rule builder |
| `lib/hr/user-self-mutation-server.ts` | Password + session nonce server mutations |
| `lib/hr/operational-access-server.ts` | Admin PB operational sync |
| `app/api/profile/self/password/route.ts` | Self password API |
| `app/api/auth/session/web/route.ts` | Web session nonce API |
| `app/api/auth/session/mobile/route.ts` | Mobile session nonce API |
| `mobile/lib/session-api.ts` | Mobile ERP session/password client |
| `scripts/pb-user-privilege-rule.mjs` | Shared PB rule for scripts |
| `scripts/migrate-local-hr-phase33a-users-rules.mjs` | Local PB migration |
| `scripts/test-phase33a-user-privilege.mjs` | Phase 33A tests |
| `docs/PHASE_33A_USER_PRIVILEGE_HARDENING_REPORT.md` | This document |

### Modified

| File | Change |
|------|--------|
| `lib/hr/api-auth.ts` | Expanded `rejectClientPrivilegeFields` |
| `lib/hr/attendance-server.ts` | Operational sync via admin PB |
| `lib/auth-session.ts` | Session nonce via API |
| `mobile/lib/auth-session.ts` | Mobile session via API |
| `components/EmployeeSelfProfile.tsx` | Password via API |
| `mobile/app/(tabs)/profile.tsx` | Password via API |
| `lib/attendance.ts` | Removed client operational sync (server handles) |
| `lib/operational-access-sync.ts` | Marked deprecated |
| `scripts/bootstrap-local-pb.mjs` | Phase 33A `users.updateRule` |
| `scripts/migrate-local-hr-employee-write.mjs` | Uses new rule builder |
| `package.json` | Phase 33A scripts |

---

## 10. Known Limitations

1. **Owner client PB update** — Owner accounts can still PATCH `users` via PocketBase client locally. Acceptable for local dev; production should rely on server APIs only.
2. **PB denial status code** — Blocked privilege PATCH returns **404** (PocketBase behavior), not 403.
3. **Session API fallback** — Web/mobile auth-session retains direct PB fallback if ERP API unreachable (legacy local).
4. **`lib/operational-access-sync.ts`** — Deprecated client module remains for reference; not used by attendance API path.
5. **Production / staging** — Rule not applied until explicitly approved and migrated per environment.

---

## 11. Recommendation — Phase 33B (Work Schedule / Shift)

Proceed only after Phase 33A sign-off:

1. Apply `users.updateRule` to **staging** with rollback plan.
2. Remove Owner client PB bypass in production (server-only for all privilege fields).
3. Add integration tests against running Next.js for password/session APIs.
4. Begin **Work Schedule / Shift** module on hardened RBAC foundation.

---

## 12. Commands

```bash
npm run migrate:local-hr-phase33a      # apply local PB rule
npm run test:phase33a-user-privilege   # Phase 33A security tests
npm run test:phase32-rbac-hardening    # regression
npm run test:phase31-employee-rbac     # regression
npx tsc --noEmit                       # TypeScript
```

**STOP:** Do not proceed to Work Schedule/Shift until Phase 33A is approved.
