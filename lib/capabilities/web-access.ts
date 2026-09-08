/**
 * lib/capabilities/web-access.ts
 * Phase 32 — Web navigation bridge using employee capabilities + path RBAC fallback.
 */

import { canAccess } from "@/lib/rbac";
import {
  hasEmployeeCapability,
  type EmployeeCapability,
} from "@/lib/capabilities/employee";
import type { AuthUserShape } from "@/lib/auth-model";

/** HR module visible if path RBAC OR employee.view capability. */
export function canAccessHrWebModule(user: AuthUserShape | null | undefined): boolean {
  if (!user) return false;
  if (canAccess(user, "/hr")) return true;
  return hasEmployeeCapability(user, "employee.view");
}

export function canAccessEmployeeManagement(user: AuthUserShape | null | undefined): boolean {
  if (!user) return false;
  return (
    hasEmployeeCapability(user, "employee.view") ||
    hasEmployeeCapability(user, "employee.create") ||
    canAccess(user, "/hr/employees")
  );
}

export function canAccessEmployeeCreate(user: AuthUserShape | null | undefined): boolean {
  if (!user) return false;
  return hasEmployeeCapability(user, "employee.create") || canAccess(user, "/hr/employees/new");
}

export function canAccessWebPathWithCapability(
  user: AuthUserShape | null | undefined,
  pathname: string,
  cap?: EmployeeCapability,
): boolean {
  if (!user) return false;
  if (cap && hasEmployeeCapability(user, cap)) return true;
  return canAccess(user, pathname);
}

/** Filter nav items by capability when href maps to employee routes. */
export function filterEmployeeNavItems<T extends { href: string }>(
  user: AuthUserShape | null | undefined,
  items: T[],
): T[] {
  if (!user) return [];
  return items.filter((item) => {
    if (item.href === "/hr/employees" || item.href.startsWith("/hr/employees/")) {
      return canAccessEmployeeManagement(user);
    }
    if (item.href === "/staff/karyawan") {
      return canAccessEmployeeManagement(user);
    }
    return canAccess(user, item.href);
  });
}

/** RBAC matrix export for documentation/tests. */
export const EMPLOYEE_CAPABILITY_MATRIX: Record<
  string,
  Record<EmployeeCapability, boolean>
> = {
  owner: {
    "employee.view": true,
    "employee.create": true,
    "employee.update": true,
    "employee.activate": true,
    "employee.deactivate": true,
    "employee.view_sensitive": true,
    "employee.manage_accounts": true,
    "employee.manage_hr_accounts": true,
    "employee.assign_manager": true,
    "employee.view_team": true,
  },
  hr: {
    "employee.view": true,
    "employee.create": true,
    "employee.update": true,
    "employee.activate": false,
    "employee.deactivate": false,
    "employee.view_sensitive": true,
    "employee.manage_accounts": true,
    "employee.manage_hr_accounts": false,
    "employee.assign_manager": true,
    "employee.view_team": true,
  },
  manager: {
    "employee.view": false,
    "employee.create": false,
    "employee.update": false,
    "employee.activate": false,
    "employee.deactivate": false,
    "employee.view_sensitive": false,
    "employee.manage_accounts": false,
    "employee.manage_hr_accounts": false,
    "employee.assign_manager": false,
    "employee.view_team": true,
  },
  staff: {
    "employee.view": false,
    "employee.create": false,
    "employee.update": false,
    "employee.activate": false,
    "employee.deactivate": false,
    "employee.view_sensitive": false,
    "employee.manage_accounts": false,
    "employee.manage_hr_accounts": false,
    "employee.assign_manager": false,
    "employee.view_team": false,
  },
  "staff-basic": {
    "employee.view": false,
    "employee.create": false,
    "employee.update": false,
    "employee.activate": false,
    "employee.deactivate": false,
    "employee.view_sensitive": false,
    "employee.manage_accounts": false,
    "employee.manage_hr_accounts": false,
    "employee.assign_manager": false,
    "employee.view_team": false,
  },
  security: {
    "employee.view": false,
    "employee.create": false,
    "employee.update": false,
    "employee.activate": false,
    "employee.deactivate": false,
    "employee.view_sensitive": false,
    "employee.manage_accounts": false,
    "employee.manage_hr_accounts": false,
    "employee.assign_manager": false,
    "employee.view_team": false,
  },
  ob: {
    "employee.view": false,
    "employee.create": false,
    "employee.update": false,
    "employee.activate": false,
    "employee.deactivate": false,
    "employee.view_sensitive": false,
    "employee.manage_accounts": false,
    "employee.manage_hr_accounts": false,
    "employee.assign_manager": false,
    "employee.view_team": false,
  },
};

export { canAccessHrWebSurface } from "@/lib/access/hr-web-access";
