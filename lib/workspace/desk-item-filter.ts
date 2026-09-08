/**
 * Meja Kerja — filter contextual items by path + existing capability catalog (not a new auth layer).
 */

import { hasAttendanceCapability } from "@/lib/capabilities/attendance";
import { canAccessEmployeeManagement } from "@/lib/capabilities/web-access";
import type { PermissionKey } from "@/lib/access/types";
import { readAccessContextFromUser } from "@/lib/access/context";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import { hasEmployeeCapability } from "@/lib/capabilities/employee";
import { canAccess } from "@/lib/rbac";
import type { DeskContextualItem } from "@/lib/workspace/desk-modules";

function legacyCapabilityHas(
  user: Record<string, unknown>,
  key: PermissionKey,
): boolean {
  if (key.startsWith("employee.")) {
    return hasEmployeeCapability(user, key as Parameters<typeof hasEmployeeCapability>[1]);
  }
  if (key.startsWith("attendance.")) {
    return hasAttendanceCapability(user, key as Parameters<typeof hasAttendanceCapability>[1]);
  }
  return false;
}

/** Show desk item only when user can reach the path and holds the mapped capability (if any). */
export function filterDeskItemsForUser(
  user: Record<string, unknown> | null | undefined,
  items: DeskContextualItem[],
): DeskContextualItem[] {
  if (!user) return [];

  const accessContext = readAccessContextFromUser(user);

  return items.filter((item) => {
    if (!canAccess(user, item.accessPath)) return false;

    if (item.id === "hr-employees") {
      return canAccessEmployeeManagement(user);
    }

    if (item.requiredCapability) {
      const legacy = legacyCapabilityHas(user, item.requiredCapability);
      if (accessContext) {
        return hasEffectiveCapability(user, accessContext, item.requiredCapability, legacy);
      }
      // Client session may lack full context blob — path access from module_web_paths is sufficient.
      return true;
    }

    return true;
  });
}
