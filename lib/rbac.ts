import { canAccessInventory, INVENTORY_WEB_PATHS, WMS_WEB_PATHS, STAFF_WEB_PATHS } from "@/lib/inventory/access";
import {
  normalizeAuthModel,
  getDefaultDashboardAccessForRole,
  isOwnerAccount,
  isHrAccount,
  isOwnerOrHrAccount,
  type AccountType,
  type UserRoleCode,
  type Role,
  type AuthUserShape,
  type AuthModel,
} from "@/lib/auth-model";
import { resolvePrimaryWorkspace } from "@/lib/org/resolve-primary-workspace";
import { resolveLandingWithAttendanceGate } from "@/lib/operational-access-gate";
import {
  hasHrOperationalWorkspace,
  hasHrPositionWorkspaceDomain,
} from "@/lib/org/hr-workspace-access";

export type { AccountType, UserRoleCode, Role, AuthUserShape, AuthModel };
export {
  normalizeAuthModel,
  getDefaultDashboardAccessForRole,
  isOwnerAccount,
  isHrAccount,
  isOwnerOrHrAccount,
};

/**
 * Rute personal yang selalu boleh tanpa check-in:
 * profil, laporan personal, lock screen, dan dashboard staff (termasuk absensi desktop cadangan).
 */
const DEFAULT_USER_ACCESS = [
  "/profile",
  "/aktivitas",
  "/hr/reports",
  "/mobile",
  "/dashboard-director",
  "/dashboard-staff",
  /** Lock screen harus selalu boleh dibuka — kalau tidak, gate → /erp-locked → default home → loop. */
  "/erp-locked",
];

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

const ROLE_ACCESS_BY_CODE: Record<UserRoleCode, string[]> = {
  hr: uniquePaths([
    "/hr",
    "/hr/employees",
    "/hr/attendance",
    "/hr/payroll",
    "/hr/attendance/leave",
    "/hr/leave",
    "/hr/overtime",
    "/hr/compensation/settings",
    "/hr/work-calendar",
    "/hr/leave/settings",
    "/hr/field-activity",
    "/hr/izin-off",
    "/hr/offices",
    "/hr/org-structure",
    "/pengaturan/organisasi",
    "/hr/profile",
    "/hr/rating",
    "/hr/findings",
    "/hr/recruitment-approvals",
    "/laporan",
    "/laporan/sdm",
    "/pengaturan",
    "/pengaturan/entitas-administratif",
    "/pengaturan/persetujuan-rekening",
    "/pengaturan/role",
    "/pengaturan/notifikasi",
    ...STAFF_WEB_PATHS,
    ...DEFAULT_USER_ACCESS,
  ]),
  manager: uniquePaths(["/dashboard-staff", ...DEFAULT_USER_ACCESS]),
  staff: uniquePaths(["/dashboard-staff", ...DEFAULT_USER_ACCESS]),
  "staff-basic": uniquePaths(["/dashboard-staff", ...DEFAULT_USER_ACCESS]),
  security: uniquePaths(DEFAULT_USER_ACCESS),
  ob: uniquePaths(DEFAULT_USER_ACCESS),
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

/** Beranda setelah login: layar lock jika belum check-in; setelah absensi → dashboard (mis. Director). */
export const getDefaultRouteForUser = (user: AuthUserShape | null | undefined): string => {
  const home = getOperationalDashboardRoute(user) ?? "/profile";
  return resolveLandingWithAttendanceGate(user as Record<string, unknown> | null | undefined, home);
};

/**
 * Desktop primary workspace home after login (Phase FLEX-ORG-01).
 * Always Desktop ERP — never /mobile, never Meja Kerja-as-home.
 *
 * Priority:
 * 1. Owner → /dashboard-owner
 * 2. Active Position.workspaceDomain (org assignment) → domain home
 * 3. Compat: effective module/path hub (e.g. HR module → /hr) — NOT role_code
 * 4. dashboard_access → /dashboard-staff
 * 5. else → null
 *
 * role_code alone does NOT determine workspace when Position domain is set.
 * Does NOT escalate from jabatan title strings.
 */
export const getOperationalDashboardRoute = (
  user: AuthUserShape | null | undefined
): string | null => {
  if (user == null) return null;
  const paths = getAllowedPathsForUser(user);
  const resolved = resolvePrimaryWorkspace({
    user,
    hasHrHubGrant: userHasHrWorkspaceLanding(user),
    hasFinanceHubGrant: paths.some((p) => p === "/keuangan" || p === "/keuangan/"),
    hasWarehouseHubGrant: paths.some((p) => p === "/gudang" || p === "/gudang/"),
  });
  return resolved.homeRoute;
};

/**
 * True when session grants the HR workspace hub (shell `/hr`).
 * Position domain HR first; else exact hub path from modules/legacy role paths.
 * Public alias: hasHrFullWorkspaceAccess — Decision 1 / Phase NEXT-FIX / HR-STAFF-01.
 */
export function hasHrFullWorkspaceAccess(
  user: AuthUserShape | null | undefined
): boolean {
  if (user == null) return false;
  if (hasHrOperationalWorkspace(user as Record<string, unknown>)) return true;
  return userHasHrWorkspaceLanding(user);
}

function userHasHrWorkspaceLanding(user: AuthUserShape): boolean {
  const rules = getAllowedPathsForUser(user);
  if (rules.includes("*")) return false; // owner already handled
  // Exact hub grant: allowed path `/hr` (not merely /hr/reports via DEFAULT_USER_ACCESS)
  return rules.some((p) => p === "/hr" || p === "/hr/");
}

export const getAllowedPathsForUser = (user: AuthUserShape | null | undefined): string[] => {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return ["*"];
  const base = !auth.roleCode
    ? [...DEFAULT_USER_ACCESS]
    : ROLE_ACCESS_BY_CODE[auth.roleCode] || [...DEFAULT_USER_ACCESS];
  let paths = canAccessInventory(user)
    ? uniquePaths([...base, ...INVENTORY_WEB_PATHS])
    : uniquePaths(base);

  // Phase 35I — additive module web paths from session-enriched model (empty = unchanged).
  const modulePaths = readModuleWebPathsFromSessionUser(user);
  if (modulePaths.length > 0) {
    paths = uniquePaths([...paths, ...modulePaths]);
  }

  // HR-STAFF-01 — Position domain HR unlocks hub `/hr` for shell/landing.
  // Deeper menus follow module_web_paths / legacy role paths (capability assignment), not domain alone.
  if (hasHrPositionWorkspaceDomain(user as Record<string, unknown>)) {
    paths = uniquePaths([...paths, "/hr"]);
  }

  return paths;
};

/** Module paths embedded on session model by /api/auth/session (not stored on users). */
function readModuleWebPathsFromSessionUser(
  user: AuthUserShape | null | undefined,
): string[] {
  if (!user || typeof user !== "object") return [];
  const raw = (user as Record<string, unknown>).module_web_paths;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string" && p.startsWith("/"));
}

/** Ringkasan akses per role (read-only, untuk halaman pengaturan). */
export const ROLE_ACCESS_SUMMARY: { code: UserRoleCode | "owner"; label: string; paths: string[] }[] = [
  { code: "owner", label: "Owner", paths: ["* (semua modul)"] },
  { code: "hr", label: "HR", paths: ROLE_ACCESS_BY_CODE.hr },
  { code: "manager", label: "Manager", paths: ROLE_ACCESS_BY_CODE.manager },
  { code: "staff", label: "Staff", paths: ROLE_ACCESS_BY_CODE.staff },
  { code: "staff-basic", label: "Staff Basic", paths: ROLE_ACCESS_BY_CODE["staff-basic"] },
  { code: "security", label: "Security", paths: ROLE_ACCESS_BY_CODE.security },
  { code: "ob", label: "OB", paths: ROLE_ACCESS_BY_CODE.ob },
];

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
  "/dashboard-director",
  "/dashboard-staff",
  "/dashboard-staff/payroll",
  "/dashboard-staff/overtime",
  "/dashboard-staff/field-activity",
  "/dashboard-staff/rating",
  "/hr",
  "/hr/employees",
  "/hr/recruitment-approvals",
  "/hr/attendance",
  "/hr/attendance/suspicious",
  "/hr/payroll",
  "/hr/attendance/leave",
  "/hr/leave",
  "/hr/overtime",
  "/hr/compensation/settings",
  "/hr/work-calendar",
  "/hr/leave/settings",
  "/hr/field-activity",
  "/hr/izin-off",
  "/hr/offices",
  "/hr/org-structure",
  "/pengaturan/organisasi",
  "/hr/profile",
  "/hr/rating",
  "/hr/rating/periods",
  "/hr/rating/assignments",
  "/hr/rating/results",
  "/hr/rating/tasks",
  "/hr/rating/my-result",
  "/hr/reports",
  "/hr/findings",
  "/profile",
  "/system",
  "/system/users",
  "/system/register",
  "/login",
  "/erp-locked",
  "/mobile-bridge",
  "/mobile",
  "/katalog",
  "/katalog/produk",
  "/katalog/bundling",
  "/katalog/harga",
  "/katalog/mapping",
  "/katalog/akun-mp",
  "/inventory",
  "/inventory/products",
  "/inventory/warehouses",
  "/inventory/stock",
  "/inventory/movements",
  "/inventory/zones",
  "/inventory/zones/checkin",
  "/inventory/activities",
  "/wms",
  "/wms/receiving",
  "/wms/qc",
  "/wms/putaway",
  "/wms/permintaan-barang",
  "/wms/picking",
  "/wms/validasi",
  "/wms/packing",
  "/wms/pickup",
  "/wms/selesai",
  "/wms/requests",
  "/wms/opname",
  "/wms/audit",
  "/wms/activity",
  "/wms/checkin",
  // Manajemen Gudang (alias /wms)
  "/gudang",
  "/gudang/penerimaan",
  "/gudang/putaway",
  "/gudang/picking",
  "/gudang/packing",
  "/gudang/permintaan",
  "/gudang/opname",
  "/gudang/audit",
  "/gudang/aktivitas",
  "/gudang/zona",
  "/gudang/lokasi",
  // Manajemen Bisnis
  "/bisnis",
  "/pos",
  "/bisnis/pos-registers",
  "/bisnis/penjualan",
  "/bisnis/purchase-order",
  "/bisnis/pembelian",
  "/bisnis/customer",
  "/bisnis/supplier",
  "/bisnis/produk",
  "/bisnis/kategori",
  "/bisnis/brand",
  "/bisnis/kalkulasi-harga-jual",
  "/bisnis/stok",
  "/bisnis/mutasi",
  "/bisnis/invoice",
  "/bisnis/retur",
  "/bisnis/biaya",
  "/bisnis/laba-rugi",
  "/bisnis/laporan-penjualan",
  "/bisnis/laporan-pembelian",
  "/keuangan",
  "/keuangan/kas-bank",
  "/keuangan/pemasukan",
  "/keuangan/piutang",
  "/keuangan/hutang",
  "/keuangan/transfer",
  "/keuangan/rekonsiliasi",
  "/keuangan/arus-kas",
  "/laporan",
  "/laporan/sdm",
  "/laporan/inventory",
  "/laporan/gudang",
  "/laporan/marketplace",
  "/penjualan",
  "/pembelian",
  "/pengaturan",
  "/pengaturan/perusahaan",
  "/pengaturan/manajemen",
  "/pengaturan/organisasi",
  "/pengaturan/struktur-organisasi",
  "/pengaturan/role",
  "/pengaturan/notifikasi",
  "/pengaturan/integrasi",
  "/pengaturan/audit-log",
  "/aktivitas",
  // Manajemen Staff (alias /hr)
  "/staff",
  "/staff/karyawan",
  "/staff/absensi",
  "/staff/mencurigakan",
  "/staff/cuti",
  "/staff/lembur",
  "/staff/jadwal",
  "/staff/lapangan",
  "/staff/gps",
  "/staff/payroll",
];
