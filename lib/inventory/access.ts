import { normalizeAuthModel } from "@/lib/auth-model";
import type { InventoryRole } from "@/lib/inventory/types";

type UserShape = Record<string, unknown> | null | undefined;

export function readInventoryRole(user: UserShape): InventoryRole {
  if (!user) return "none";
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "admin";
  const raw = (user.inventory_role ?? "none").toString().toLowerCase().trim();
  if (raw === "staff" || raw === "supervisor" || raw === "admin") return raw;
  return "none";
}

export function canAccessInventory(user: UserShape): boolean {
  return readInventoryRole(user) !== "none" || normalizeAuthModel(user).accountType === "owner";
}

export function isInventoryAdmin(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  return readInventoryRole(user) === "admin";
}

export function canManageInventoryMaster(user: UserShape): boolean {
  return isInventoryAdmin(user);
}

/** Staff gudang boleh kelola rak/bin untuk putaway (bukan master kategori/merek). */
export function canManageWarehouseLocations(user: UserShape): boolean {
  return canAccessInventory(user);
}

export function canPostInventoryMovement(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  const role = readInventoryRole(user);
  return role === "admin" || role === "supervisor";
}

export function canCreateInventoryDraft(user: UserShape): boolean {
  return canAccessInventory(user);
}

/** Supervisor+ melihat semua aktivitas staff di gudang. */
export function canViewAllStaffActivities(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  const role = readInventoryRole(user);
  return role === "admin" || role === "supervisor";
}

export function isInventorySupervisorOrAbove(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  const role = readInventoryRole(user);
  return role === "admin" || role === "supervisor";
}

export function canManageOpnameSession(user: UserShape): boolean {
  return isInventorySupervisorOrAbove(user);
}

/** Staff gudang — hanya operasi WMS, bukan master ERP. */
export function isWarehouseStaffOnly(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return false;
  return readInventoryRole(user) === "staff";
}

export function canAccessErpInventoryCore(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  const role = readInventoryRole(user);
  return role === "admin" || role === "supervisor";
}

export function canAccessWms(user: UserShape): boolean {
  return canAccessInventory(user);
}

/** Default landing setelah login inventori */
export function getDefaultInventoryRoute(user: UserShape): string {
  if (isWarehouseStaffOnly(user)) return "/wms";
  return "/inventory";
}

export const WMS_WEB_PATHS = [
  "/wms",
  "/wms/receiving",
  "/wms/qc",
  "/wms/putaway",
  "/wms/picking",
  "/wms/validasi",
  "/wms/packing",
  "/wms/pickup",
  "/wms/requests",
  "/wms/opname",
  "/wms/audit",
  "/wms/activity",
  "/wms/checkin",
] as const;

export const GUDANG_WEB_PATHS = [
  "/gudang",
  "/gudang/penerimaan",
  "/gudang/qc",
  "/gudang/putaway",
  "/gudang/picking",
  "/gudang/validasi",
  "/gudang/packing",
  "/gudang/pickup",
  "/gudang/permintaan",
  "/gudang/opname",
  "/gudang/audit",
  "/gudang/aktivitas",
  "/gudang/zona",
  "/gudang/lokasi",
  "/gudang/produk",
  "/gudang/transfer",
  "/gudang/scanner",
  "/gudang/label",
  "/gudang/stok",
] as const;

export const BISNIS_WEB_PATHS = [
  "/bisnis",
  "/bisnis/penjualan",
  "/bisnis/purchase-order",
  "/bisnis/pembelian",
  "/bisnis/customer",
  "/bisnis/supplier",
  "/bisnis/produk",
  "/bisnis/kategori",
  "/bisnis/brand",
  "/bisnis/kalkulasi-harga-jual",
  "/bisnis/invoice",
  "/bisnis/retur",
  "/bisnis/laporan-penjualan",
  "/bisnis/laporan-pembelian",
] as const;

export const STAFF_WEB_PATHS = [
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
] as const;

export const ERP_INVENTORY_CORE_PATHS = [
  "/inventory",
  "/inventory/products",
  "/inventory/warehouses",
  "/inventory/categories",
  "/inventory/brands",
  "/inventory/locations",
  "/inventory/access",
] as const;

export const INVENTORY_WEB_PATHS = [
  ...ERP_INVENTORY_CORE_PATHS,
  ...WMS_WEB_PATHS,
  ...GUDANG_WEB_PATHS,
  ...BISNIS_WEB_PATHS,
  ...STAFF_WEB_PATHS,
  "/inventory/stock",
  "/inventory/movements",
  "/inventory/zones",
  "/inventory/zones/checkin",
  "/inventory/activities",
  "/inventory/packing",
  "/inventory/opname",
  "/inventory/audit",
  "/inventory/cctv",
  "/inventory/media",
] as const;
