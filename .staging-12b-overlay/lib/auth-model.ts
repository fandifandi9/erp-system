export type AccountType = "owner" | "user";
export type UserRoleCode =
  | "hr"
  | "manager"
  | "staff"
  | "staff-basic"
  | "security"
  | "ob";
export type Role = "owner" | UserRoleCode;

export type AuthUserShape = {
  [key: string]: unknown;
  role?: string;
  role_code?: string;
  account_type?: string;
  dashboard_access?: boolean;
};

export type AuthModel = {
  accountType: AccountType;
  roleCode: UserRoleCode | null;
  dashboardAccess: boolean;
};

const DASHBOARD_ROLES: UserRoleCode[] = ["hr", "manager", "staff"];

export const getDefaultDashboardAccessForRole = (roleCode: UserRoleCode): boolean =>
  DASHBOARD_ROLES.includes(roleCode);

const VALID_ROLE_CODES: UserRoleCode[] = ["hr", "manager", "staff", "staff-basic", "security", "ob"];

const normalizeRoleCode = (value: unknown): UserRoleCode | null => {
  const normalized = (value || "").toString().toLowerCase().trim();
  return VALID_ROLE_CODES.includes(normalized as UserRoleCode)
    ? (normalized as UserRoleCode)
    : null;
};

export const normalizeAuthModel = (user: AuthUserShape | null | undefined): AuthModel => {
  const rawRole = (user?.role || user?.role_code || "").toString().toLowerCase().trim();
  const accountType = ((user?.account_type || (rawRole === "owner" ? "owner" : "user")) as string)
    .toLowerCase()
    .trim() as AccountType;

  if (accountType === "owner") {
    return {
      accountType: "owner",
      roleCode: null,
      dashboardAccess: true,
    };
  }

  const roleCode = normalizeRoleCode(user?.role_code) || normalizeRoleCode(rawRole) || "staff-basic";
  const dashboardAccess =
    typeof user?.dashboard_access === "boolean"
      ? user.dashboard_access
      : getDefaultDashboardAccessForRole(roleCode);

  return {
    accountType: "user",
    roleCode,
    dashboardAccess,
  };
};

/**
 * Canonical identity / role checks for NEW security decisions.
 * Prefer these over legacy `user.role === "owner"|"hr"`.
 * `role` remains a compatibility mirror only (see getNormalizedUserSchemaFields).
 */
export function isOwnerAccount(user: AuthUserShape | null | undefined): boolean {
  return normalizeAuthModel(user).accountType === "owner";
}

/** HR job role: account_type user + role_code hr. Owner is NOT HR. */
export function isHrAccount(user: AuthUserShape | null | undefined): boolean {
  const auth = normalizeAuthModel(user);
  return auth.accountType === "user" && auth.roleCode === "hr";
}

export function isOwnerOrHrAccount(user: AuthUserShape | null | undefined): boolean {
  return isOwnerAccount(user) || isHrAccount(user);
}
