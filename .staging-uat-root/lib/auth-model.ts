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
