/**
 * lib/hr/user-privilege-fields.ts
 * Phase 33A — Central list of user privilege/security fields (server-only mutation).
 */

/** Must not be mutated via PocketBase client self-update or forged API bodies. */
export const USER_PRIVILEGE_FIELD_NAMES = [
  "role",
  "role_code",
  "account_type",
  "dashboard_access",
  "status",
  "inventory_role",
  "hr_role_preset",
  "web_access",
  "active_company",
  "default_company",
  "active_store",
  "default_store",
  "active_warehouse",
  "default_warehouse",
  "is_checked_in",
  "shift_active",
  "last_checkin",
  "last_checkout",
  "locale",
  "name",
  "email",
  "emailVisibility",
  "verified",
] as const;

export type UserPrivilegeFieldName = (typeof USER_PRIVILEGE_FIELD_NAMES)[number];

/**
 * Fields that may still be updated by the authenticated user via PocketBase client
 * (session binding only). Password changes must use /api/profile/self/password.
 */
export const USER_SELF_CLIENT_PB_FIELD_NAMES = [
  "session_nonce",
  "mobile_session_nonce",
] as const;

/** Password fields — rejected from generic API bodies; use dedicated password endpoint. */
export const USER_PASSWORD_FIELD_NAMES = [
  "oldPassword",
  "password",
  "passwordConfirm",
] as const;

const OWNER_ONLY_UPDATE_EXPR =
  '@request.auth.account_type = "owner" || @request.auth.role = "owner"';

/**
 * PocketBase users.updateRule expression.
 * Self may only patch session nonces; privilege fields blocked via :isset guards.
 * Owner may still patch via client (local admin); HR/staff must use server APIs.
 */
export function buildUsersUpdateRulePbExpression(): string {
  const privilegeGuard = USER_PRIVILEGE_FIELD_NAMES.map(
    (field) => `@request.data.${field}:isset = false`,
  ).join(" && ");

  const passwordGuard = USER_PASSWORD_FIELD_NAMES.map(
    (field) => `@request.data.${field}:isset = false`,
  ).join(" && ");

  const selfSafe = `@request.auth.id = id && ${privilegeGuard} && ${passwordGuard}`;

  return `@request.auth.id != "" && ((${selfSafe}) || (${OWNER_ONLY_UPDATE_EXPR}))`;
}

export function rejectClientUserPrivilegeFields(
  body: Record<string, unknown> | null | undefined,
): void {
  if (!body || typeof body !== "object") return;

  const forbidden = [
    ...USER_PRIVILEGE_FIELD_NAMES,
    ...USER_PASSWORD_FIELD_NAMES,
  ] as const;

  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new Error(`Field '${key}' tidak boleh dikirim oleh klien.`);
    }
  }
}
