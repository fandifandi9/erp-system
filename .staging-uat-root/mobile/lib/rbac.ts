export type AccountType = "owner" | "user";
export type UserRoleCode =
  | "hr"
  | "manager"
  | "staff"
  | "staff-basic"
  | "security"
  | "ob";
export type Role = "owner" | UserRoleCode;

type AuthUserShape = {
  [key: string]: unknown;
  role?: string;
  role_code?: string;
  account_type?: string;
  dashboard_access?: boolean;
};

type AuthModel = {
  accountType: AccountType;
  roleCode: UserRoleCode | null;
  dashboardAccess: boolean;
};

const DASHBOARD_ROLES: UserRoleCode[] = ["hr", "manager", "staff"];
export const getDefaultDashboardAccessForRole = (roleCode: UserRoleCode): boolean =>
  DASHBOARD_ROLES.includes(roleCode);

/** Rute akun di web tanpa modul absensi (absensi hanya app native). */
const DEFAULT_USER_ACCESS = ["/profile"];

const ROLE_ACCESS_BY_CODE: Record<UserRoleCode, string[]> = {
  hr: [
    "/hr",
    "/hr/employees",
    "/hr/attendance",
    "/hr/payroll",
    "/hr/attendance/leave",
    "/hr/leave",
    "/hr/overtime",
    "/hr/field-activity",
    "/hr/offices",
    "/hr/profile",
    /** Meja kerja pribadi di app (cuti, lembur, slip, dinas) — selaras tab native */
    "/dashboard-staff",
    ...DEFAULT_USER_ACCESS,
  ],
  manager: ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  staff: ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  "staff-basic": ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  security: [...DEFAULT_USER_ACCESS],
  ob: [...DEFAULT_USER_ACCESS],
};

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

type UserSchemaFields = {
  account_type: AccountType;
  role_code: UserRoleCode | null;
  dashboard_access: boolean;
  role: string;
};

export const getNormalizedUserSchemaFields = (
  user: AuthUserShape | null | undefined
): UserSchemaFields => {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") {
    return {
      account_type: "owner",
      role_code: null,
      dashboard_access: true,
      role: "owner",
    };
  }

  const roleCode = auth.roleCode || "staff-basic";
  return {
    account_type: "user",
    role_code: roleCode,
    dashboard_access: auth.dashboardAccess,
    role: roleCode,
  };
};

/**
 * Dashboard web “meja kerja” (sidebar): Owner, HR, atau staf dengan `dashboard_access`.
 * Null jika akun hanya pakai modul HP (mis. satpam tanpa dashboard).
 */
export const getOperationalDashboardRoute = (
  user: AuthUserShape | null | undefined
): string | null => {
  if (user == null) return null;
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "/dashboard-owner";
  if (auth.roleCode === "hr") return "/hr";
  if (auth.dashboardAccess) return "/dashboard-staff";
  return null;
};

/** Beranda setelah login / URL lawas: dashboard kerja jika ada, selain itu profil. */
export const getDefaultRouteForUser = (user: AuthUserShape | null | undefined): string => {
  return getOperationalDashboardRoute(user) ?? "/profile";
};

export const getAllowedPathsForUser = (user: AuthUserShape | null | undefined): string[] => {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return ["*"];
  if (!auth.roleCode) return [...DEFAULT_USER_ACCESS];
  return ROLE_ACCESS_BY_CODE[auth.roleCode] || [...DEFAULT_USER_ACCESS];
};

export const canAccess = (user: AuthUserShape | null | undefined, pathname: string): boolean => {
  const rules = getAllowedPathsForUser(user);
  if (rules.includes("*")) return true;
  return rules.some((p) => pathname.startsWith(p));
};

// ========================================
// 📋 LIST OF ALL KNOWN ROUTES
// ========================================
export const KNOWN_ROUTES = [
  "/dashboard-owner",
  "/dashboard-staff",
  "/dashboard-staff/payroll",
  "/dashboard-staff/overtime",
  "/dashboard-staff/field-activity",
  "/hr",
  "/hr/employees",
  "/hr/attendance",
  "/hr/payroll",
  "/hr/attendance/leave",
  "/hr/leave",
  "/hr/overtime",
  "/hr/field-activity",
  "/hr/offices",
  "/hr/profile",
  "/profile",
  "/system",
  "/system/users",
  "/system/register",
  "/login",
  "/erp-locked",
];
