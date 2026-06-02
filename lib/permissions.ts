export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export"
  | "audit";

export type ModuleKey = "gudang" | "bisnis" | "staff" | "dashboard";

export type Permission = {
  module: ModuleKey;
  subModule?: string;
  actions: PermissionAction[];
};

export type RoleTemplate = {
  key: string;
  label: string;
  permissions: Permission[];
};

const ALL_ACTIONS: PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "audit",
];

const GUDANG_SUBMODULES = [
  "receiving",
  "qc",
  "putaway",
  "lokasi",
  "picking",
  "packing",
  "requests",
  "opname",
  "audit_gudang",
  "aktivitas",
  "zona",
] as const;

const BISNIS_SUBMODULES = [
  "penjualan",
  "purchase_order",
  "pembelian",
  "customer",
  "supplier",
  "produk",
  "kategori",
  "brand",
  "kalkulasi_harga_jual",
  "stok",
  "mutasi",
  "invoice",
  "retur",
  "laporan",
] as const;

const STAFF_SUBMODULES = [
  "karyawan",
  "absensi",
  "cuti",
  "lembur",
  "jadwal",
  "lapangan",
  "gps",
  "payroll",
] as const;

function fullModule(module: ModuleKey, subModules: readonly string[]): Permission[] {
  return subModules.map((sub) => ({
    module,
    subModule: sub,
    actions: [...ALL_ACTIONS],
  }));
}

function viewModule(module: ModuleKey, subModules: readonly string[]): Permission[] {
  return subModules.map((sub) => ({
    module,
    subModule: sub,
    actions: ["view"] as PermissionAction[],
  }));
}

const STAFF_GUDANG_ALLOWED: readonly string[] = [
  "receiving",
  "qc",
  "putaway",
  "lokasi",
  "picking",
  "packing",
  "requests",
  "opname",
  "aktivitas",
  "zona",
];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: "super_owner",
    label: "Super Owner",
    permissions: [
      { module: "dashboard", actions: [...ALL_ACTIONS] },
      ...fullModule("gudang", GUDANG_SUBMODULES),
      ...fullModule("bisnis", BISNIS_SUBMODULES),
      ...fullModule("staff", STAFF_SUBMODULES),
    ],
  },
  {
    key: "admin_bisnis",
    label: "Admin Bisnis",
    permissions: [
      { module: "dashboard", actions: ["view"] },
      ...fullModule("bisnis", BISNIS_SUBMODULES),
      ...viewModule("gudang", GUDANG_SUBMODULES),
      ...viewModule("staff", STAFF_SUBMODULES),
    ],
  },
  {
    key: "kepala_gudang",
    label: "Kepala Gudang",
    permissions: [
      { module: "dashboard", actions: ["view"] },
      ...fullModule("gudang", GUDANG_SUBMODULES),
      { module: "bisnis", subModule: "stok", actions: ["view"] },
      { module: "bisnis", subModule: "mutasi", actions: ["view"] },
    ],
  },
  {
    key: "staff_gudang",
    label: "Staff Gudang",
    permissions: [
      { module: "dashboard", actions: ["view"] },
      ...STAFF_GUDANG_ALLOWED.map((sub) => ({
        module: "gudang" as ModuleKey,
        subModule: sub,
        actions: ["view", "create"] as PermissionAction[],
      })),
    ],
  },
  {
    key: "hr_admin",
    label: "HR Admin",
    permissions: [
      { module: "dashboard", actions: ["view"] },
      ...fullModule("staff", STAFF_SUBMODULES),
    ],
  },
  {
    key: "staff_kantor",
    label: "Staff Kantor",
    permissions: [
      { module: "dashboard", actions: ["view"] },
      ...viewModule("bisnis", BISNIS_SUBMODULES),
    ],
  },
];

export function hasPermission(
  userPermissions: Permission[],
  module: ModuleKey,
  subModule: string | undefined,
  action: PermissionAction
): boolean {
  return userPermissions.some(
    (p) =>
      p.module === module &&
      (subModule === undefined || p.subModule === undefined || p.subModule === subModule) &&
      p.actions.includes(action)
  );
}

export function getRolePermissions(roleKey: string): Permission[] {
  const template = ROLE_TEMPLATES.find((r) => r.key === roleKey);
  return template?.permissions ?? [];
}

export function resolveUserRole(user: Record<string, unknown>): string {
  if (user.account_type === "owner") return "super_owner";
  if (user.role_code === "hr") return "hr_admin";
  if (user.inventory_role === "admin") return "admin_bisnis";
  if (user.inventory_role === "supervisor") return "kepala_gudang";
  if (user.inventory_role === "staff") return "staff_gudang";
  return "staff_kantor";
}
