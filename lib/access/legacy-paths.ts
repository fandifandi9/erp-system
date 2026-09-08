/**
 * Phase 35I — Legacy RBAC path resolution (unchanged baseline).
 * Extracted from lib/rbac.ts for additive merge with module assignments.
 */

import { canAccessInventory, INVENTORY_WEB_PATHS } from "@/lib/inventory/access";
import { normalizeAuthModel, type AuthUserShape } from "@/lib/auth-model";

const DEFAULT_USER_ACCESS = ["/profile", "/aktivitas", "/hr/reports"];

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

const ROLE_ACCESS_BY_CODE: Record<string, string[]> = {
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
    "/hr/offices",
    "/hr/org-structure",
    "/pengaturan/organisasi",
    "/hr/profile",
    "/hr/rating",
    "/hr/findings",
    "/laporan",
    "/laporan/sdm",
    "/pengaturan",
    "/pengaturan/entitas-administratif",
    "/pengaturan/persetujuan-rekening",
    "/pengaturan/role",
    "/pengaturan/notifikasi",
    "/dashboard-staff",
    ...DEFAULT_USER_ACCESS,
  ]),
  manager: uniquePaths(["/dashboard-staff", ...DEFAULT_USER_ACCESS]),
  staff: uniquePaths(["/dashboard-staff", ...DEFAULT_USER_ACCESS]),
  "staff-basic": uniquePaths(["/dashboard-staff", ...DEFAULT_USER_ACCESS]),
  security: uniquePaths(DEFAULT_USER_ACCESS),
  ob: uniquePaths(DEFAULT_USER_ACCESS),
};

/** Legacy-only allowed paths — identical to pre-35I RBAC (excluding module grants). */
export function resolveLegacyAllowedPaths(user: AuthUserShape | null | undefined): string[] {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return ["*"];
  const base = !auth.roleCode
    ? [...DEFAULT_USER_ACCESS]
    : ROLE_ACCESS_BY_CODE[auth.roleCode] || [...DEFAULT_USER_ACCESS];
  if (canAccessInventory(user)) {
    return uniquePaths([...base, ...INVENTORY_WEB_PATHS]);
  }
  return uniquePaths(base);
}

export function mergeAllowedPathPrefixes(
  legacy: string[],
  modulePaths: string[],
): string[] {
  if (legacy.includes("*")) return legacy;
  return uniquePaths([...legacy, ...modulePaths]);
}
