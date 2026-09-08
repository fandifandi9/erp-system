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

export type { AccountType, UserRoleCode, Role, AuthUserShape, AuthModel };
export {
  normalizeAuthModel,
  getDefaultDashboardAccessForRole,
  isOwnerAccount,
  isHrAccount,
  isOwnerOrHrAccount,
};

/** Rute akun di web tanpa modul absensi (absensi hanya app native). */
const DEFAULT_USER_ACCESS = ["/profile", "/aktivitas"];

const ROLE_ACCESS_BY_CODE: Record<UserRoleCode, string[]> = {
  hr: [
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
    "/hr/offices",
    "/hr/profile",
    "/hr/rating",
    "/laporan",
    "/laporan/sdm",
    "/pengaturan",
    "/pengaturan/role",
    "/pengaturan/notifikasi",
    ...STAFF_WEB_PATHS,
    ...DEFAULT_USER_ACCESS,
  ],
  manager: ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  staff: ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  "staff-basic": ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  security: [...DEFAULT_USER_ACCESS],
  ob: [...DEFAULT_USER_ACCESS],
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

/** Beranda setelah login / URL lawas: dashboard kerja jika ada, selain itu profil. */
export const getDefaultRouteForUser = (user: AuthUserShape | null | undefined): string => {
  return getOperationalDashboardRoute(user) ?? "/profile";
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

export const getAllowedPathsForUser = (user: AuthUserShape | null | undefined): string[] => {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return ["*"];
  const base = !auth.roleCode
    ? [...DEFAULT_USER_ACCESS]
    : ROLE_ACCESS_BY_CODE[auth.roleCode] || [...DEFAULT_USER_ACCESS];
  if (canAccessInventory(user)) {
    return [...base, ...INVENTORY_WEB_PATHS];
  }
  return base;
};

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
  "/dashboard-staff",
  "/dashboard-staff/payroll",
  "/dashboard-staff/overtime",
  "/dashboard-staff/field-activity",
  "/dashboard-staff/rating",
  "/hr",
  "/hr/employees",
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
  "/hr/offices",
  "/hr/profile",
  "/hr/rating",
  "/hr/rating/periods",
  "/hr/rating/assignments",
  "/hr/rating/results",
  "/hr/rating/tasks",
  "/hr/rating/my-result",
  "/profile",
  "/system",
  "/system/users",
  "/system/register",
  "/login",
  "/erp-locked",
  "/mobile-bridge",
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
