/**
 * Shared PocketBase users.updateRule for Phase 33A (importable from .mjs scripts).
 */

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
];

export const USER_PASSWORD_FIELD_NAMES = ["oldPassword", "password", "passwordConfirm"];

const OWNER_ONLY_UPDATE_EXPR =
  '@request.auth.account_type = "owner" || @request.auth.role = "owner"';

export function buildUsersUpdateRulePbExpression() {
  const privilegeGuard = USER_PRIVILEGE_FIELD_NAMES.map(
    (field) => `@request.data.${field}:isset = false`,
  ).join(" && ");

  const passwordGuard = USER_PASSWORD_FIELD_NAMES.map(
    (field) => `@request.data.${field}:isset = false`,
  ).join(" && ");

  const selfSafe = `@request.auth.id = id && ${privilegeGuard} && ${passwordGuard}`;

  return `@request.auth.id != "" && ((${selfSafe}) || (${OWNER_ONLY_UPDATE_EXPR}))`;
}
