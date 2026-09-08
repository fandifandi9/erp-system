import type { UserRoleCode } from "@/lib/auth-model";
import type { InventoryRole } from "@/lib/inventory/types";

/** Preset tampilan HR — memetakan ke `role_code` + `inventory_role` di PocketBase. */
export type EmployeeRolePresetId =
  | "hr"
  | "manager"
  | "staff"
  | "accounting"
  | "warehouse_staff"
  | "warehouse_supervisor"
  | "security"
  | "ob";

export type EmployeeRolePreset = {
  id: EmployeeRolePresetId;
  roleCode: UserRoleCode;
  inventoryRole: InventoryRole;
  defaultDashboard: boolean;
};

export const EMPLOYEE_ROLE_PRESETS: EmployeeRolePreset[] = [
  { id: "hr", roleCode: "hr", inventoryRole: "none", defaultDashboard: true },
  { id: "manager", roleCode: "manager", inventoryRole: "none", defaultDashboard: true },
  { id: "staff", roleCode: "staff", inventoryRole: "none", defaultDashboard: true },
  { id: "accounting", roleCode: "staff", inventoryRole: "none", defaultDashboard: true },
  { id: "warehouse_staff", roleCode: "staff", inventoryRole: "staff", defaultDashboard: true },
  { id: "warehouse_supervisor", roleCode: "manager", inventoryRole: "supervisor", defaultDashboard: true },
  { id: "security", roleCode: "security", inventoryRole: "none", defaultDashboard: false },
  { id: "ob", roleCode: "ob", inventoryRole: "none", defaultDashboard: false },
];

export const HR_ROLE_PRESET_FIELD = "hr_role_preset";

export type EmployeeAccountFields = {
  role?: string;
  role_code?: string;
  inventory_role?: string;
  hr_role_preset?: string;
  dashboard_access?: boolean;
};

export function employeeRolePresetById(id: string): EmployeeRolePreset | undefined {
  return EMPLOYEE_ROLE_PRESETS.find((p) => p.id === id);
}

/** Cocokkan preset dari field tersimpan atau kombinasi role_code + inventory_role. */
export function inferEmployeeRolePresetId(user: EmployeeAccountFields): EmployeeRolePresetId {
  const stored = String(user.hr_role_preset || "").trim();
  if (stored && employeeRolePresetById(stored)) {
    return stored as EmployeeRolePresetId;
  }

  const roleCode = String(user.role_code || user.role || "").toLowerCase();
  const inv = String(user.inventory_role || "none").toLowerCase();

  if (roleCode === "hr") return "hr";
  if (roleCode === "security") return "security";
  if (roleCode === "ob") return "ob";
  if (roleCode === "manager" && inv === "supervisor") return "warehouse_supervisor";
  if (roleCode === "manager") return "manager";
  if (roleCode === "staff" && inv === "staff") return "warehouse_staff";
  if (roleCode === "staff") return "staff";
  return "staff";
}

export function getEmployeeRoleLabel(
  user: EmployeeAccountFields,
  t: (key: string) => string,
): string {
  const presetId = inferEmployeeRolePresetId(user);
  return t(`hr.employees.new.roles.${presetId}`);
}

export function isDashboardAccessEnabled(user: EmployeeAccountFields): boolean {
  if (typeof user.dashboard_access === "boolean") return user.dashboard_access;
  const preset = employeeRolePresetById(inferEmployeeRolePresetId(user));
  return preset?.defaultDashboard ?? false;
}
