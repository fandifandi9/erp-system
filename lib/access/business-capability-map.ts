/**
 * Phase 35I-C — Business capability → internal web path map (HR).
 * Paths are derived convenience for route access; API auth remains capability-based.
 * Do not invent capabilities; map only existing enforced keys.
 */

import type { ModuleId, PermissionKey } from "@/lib/access/types";

/** Curated, minimal path grants per business capability (HR). */
const HR_CAPABILITY_PATH_MAP: Record<string, readonly string[]> = {
  "employee.view": ["/hr", "/hr/employees", "/hr/recruitment-approvals", "/pengaturan/organisasi"],
  "employee.create": ["/hr", "/hr/employees", "/hr/employees/new", "/pengaturan/organisasi"],
  "employee.update": ["/hr", "/hr/employees", "/hr/recruitment-approvals", "/pengaturan/organisasi"],
  "employee.view_sensitive": ["/hr", "/hr/employees"],
  "employee.manage_accounts": ["/hr", "/hr/employees", "/pengaturan/organisasi"],
  "employee.assign_manager": ["/hr", "/hr/employees", "/pengaturan/organisasi"],
  "employee.view_team": ["/hr", "/hr/employees"],

  "attendance.view_team": ["/hr", "/hr/attendance", "/hr/attendance/suspicious"],
  "attendance.manage": ["/hr", "/hr/attendance", "/hr/attendance/suspicious"],

  "schedule.view": ["/hr", "/hr/work-calendar"],
  "schedule.create": ["/hr", "/hr/work-calendar"],
  "schedule.update": ["/hr", "/hr/work-calendar"],
  "schedule.assign": ["/hr", "/hr/work-calendar"],
  "schedule.manage": ["/hr", "/hr/work-calendar"],

  "payslip.view_scoped": ["/hr", "/hr/payroll"],
  "payslip.download_scoped": ["/hr", "/hr/payroll"],

  "hr_policy.view_published": ["/hr", "/hr/policies", "/hr/leave/settings"],
  "hr_policy.manage": ["/hr", "/hr/policies", "/hr/leave/settings", "/hr/compensation/settings"],

  "employee_document.view_scoped": ["/hr", "/hr/employees"],
  "employee_document.download_scoped": ["/hr", "/hr/employees"],

  "master_data.entity.view": ["/hr", "/pengaturan/entitas-administratif"],
  "master_data.membership.assign": ["/hr", "/hr/employees", "/pengaturan/entitas-administratif"],
};

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.filter((p) => typeof p === "string" && p.startsWith("/")))];
}

/** Derive internal route prefixes from business capability keys (not web: keys). */
export function deriveWebPathsFromBusinessCapabilities(
  moduleId: ModuleId,
  permissionKeys: readonly PermissionKey[],
): string[] {
  if (moduleId !== "hr") return [];

  const paths: string[] = [];
  for (const key of permissionKeys) {
    if (key.startsWith("web:")) continue;
    const mapped = HR_CAPABILITY_PATH_MAP[key];
    if (mapped) paths.push(...mapped);
  }
  return uniquePaths(paths);
}

/** True when key is a technical web path grant (legacy CUSTOM). */
export function isTechnicalWebPermissionKey(key: string): boolean {
  return key.startsWith("web:");
}
