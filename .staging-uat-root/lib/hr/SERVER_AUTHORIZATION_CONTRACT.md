# HR Server Authorization Contract (Wave 1)

Status: **READY** for foundation · Mutations (leave/OT/attendance/payroll): **NOT** implemented yet.

This contract applies to all future `/api/hr/*` mutation handlers.

## Request path

```
Request
  → HttpOnly session (pb_auth) or Authorization Bearer
  → PocketBase authRefresh (validated user record)
  → Canonical role (account_type + role_code)
  → Company scope (server-resolved companyIds)
  → Domain handler
  → Response
```

## Rules (mandatory)

1. **Authentication required** — no anonymous HR mutations.
2. **Identity from session only** — `userId` / actor from `authRefresh` record, never from request body.
3. **Role verified server-side** — Owner: `account_type === "owner"`; HR: `account_type === "user" && role_code === "hr"`. Do not use legacy `role === "owner"|"hr"` for new checks.
4. **Company scope verified server-side** — use `getAccessibleCompanyIds` / `requireCompanyInActorScope`. Never trust `company_id` from the body as proof of access.
5. **Target record scope verified server-side** — load the record, then check ownership / company (Wave 2+ when HR rows carry company).
6. **Client cannot define actor identity** — ignore / reject body `user` when it would escalate.
7. **Client cannot define approval identity** — reject `hr_action_*`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at` from client (`rejectClientPrivilegeFields`).
8. **Client cannot define company scope** — accessible companies come from Owner-all or `biz_user_companies`.
9. **Client cannot define privileged role** — reject body `account_type` / `role` / `role_code`.
10. **Fail closed** — auth failure → 401; role/scope failure → 403; never default-allow.

## Canonical auth

| Check | Expression |
|-------|------------|
| Owner | `account_type === "owner"` |
| HR | `account_type === "user" && role_code === "hr"` |
| Legacy `role` | Compatibility mirror only |

## Helpers

- `lib/hr/api-auth.ts` — `getAuthenticatedHrUser`, `requireOwnerOrHrApiUser`, `rejectClientPrivilegeFields`
- `lib/hr/company-scope.ts` — `getAccessibleCompanyIds`, `assertCompanyInScope`
- `lib/auth-model.ts` — `isOwnerAccount`, `isHrAccount`, `isOwnerOrHrAccount`

## Out of scope (later waves)

Overtime / attendance / payroll / profile mutations, PB live rule changes, `profiles.company`.

## Implemented (Wave 2)

Leave mutations:

- `POST /api/hr/leave` — submit
- `POST /api/hr/leave/:id/approve`
- `POST /api/hr/leave/:id/reject`
- `POST /api/hr/leave/:id/cancel`

See `lib/hr/leave-server.ts`.

## Wave 2B — PocketBase write lock

Target: `createRule` / `updateRule` / `deleteRule` = **`null`** (superuser-only).

User tokens must not mutate `leave_requests`. Production apply requires staging first — see `pb/rules/leave_requests.md`.
