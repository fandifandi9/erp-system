/**
 * lib/hr/employee-scope.ts
 * Phase 31 — Data scope resolution for employee operations.
 */

import type PocketBase from "pocketbase";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import type { UserAccessContext } from "@/lib/access/types";
import {
  getEmployeeCapabilityScope,
  hasEmployeeCapability,
  EMPLOYEE_CAPABILITY_DEFS,
  type EmployeeCapability,
  type EmployeeDataScope,
} from "@/lib/capabilities/employee";
import { normalizeAuthModel, type AuthUserShape } from "@/lib/auth-model";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";

export const PROFILE_MANAGER_FIELD = "manager";

export type EmployeeTargetContext = {
  userId: string;
  profileId?: string;
  managerUserId?: string | null;
  targetUser?: AuthUserShape;
};

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * List user IDs whose profiles report to `managerUserId`.
 * Returns empty when manager field absent or no matches.
 */
export async function listManagedEmployeeUserIds(
  adminPb: PocketBase,
  managerUserId: string,
): Promise<string[]> {
  if (!managerUserId) return [];
  try {
    const rows = await adminPb.collection("profiles").getFullList({
      filter: `${PROFILE_MANAGER_FIELD} = "${pbEscape(managerUserId)}"`,
      fields: "id,user",
    });
    return rows
      .map((r) => {
        const u = (r as { user?: unknown }).user;
        if (typeof u === "string") return u;
        if (u && typeof u === "object" && "id" in u) return String((u as { id: string }).id);
        return "";
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Direct + indirect reports (transitive), max depth guarded. */
export async function listAllManagedEmployeeUserIds(
  adminPb: PocketBase,
  managerUserId: string,
  maxDepth = 16,
): Promise<string[]> {
  const result = new Set<string>();
  let frontier = [managerUserId];
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const next: string[] = [];
    for (const mgr of frontier) {
      const direct = await listManagedEmployeeUserIds(adminPb, mgr);
      for (const uid of direct) {
        if (!result.has(uid)) {
          result.add(uid);
          next.push(uid);
        }
      }
    }
    frontier = next;
    depth += 1;
  }
  return [...result];
}

function resolveEmployeeCapabilityScope(
  actor: AuthUserShape,
  capability: EmployeeCapability,
  accessContext?: UserAccessContext | null,
): EmployeeDataScope | null {
  const legacyHas = hasEmployeeCapability(actor, capability);
  if (!hasEffectiveCapability(actor, accessContext, capability, legacyHas)) return null;
  if (legacyHas) return getEmployeeCapabilityScope(actor, capability);
  return EMPLOYEE_CAPABILITY_DEFS[capability]?.defaultScope ?? "COMPANY";
}

export async function canActorAccessTargetUser(
  adminPb: PocketBase,
  actor: AuthUserShape,
  actorUserId: string,
  capability: EmployeeCapability,
  target: EmployeeTargetContext,
  options?: {
    accessContext?: UserAccessContext | null;
    actorCompanyIds?: string[];
  },
): Promise<boolean> {
  const scope = resolveEmployeeCapabilityScope(actor, capability, options?.accessContext);
  if (!scope) return false;

  if (scope === "OWN") {
    return target.userId === actorUserId;
  }

  if (scope === "MANAGED_EMPLOYEES") {
    if (normalizeAuthModel(actor).accountType === "owner") return true;
    if (target.managerUserId === actorUserId) return true;
    const managed = await listAllManagedEmployeeUserIds(adminPb, actorUserId);
    return managed.includes(target.userId);
  }

  if (scope === "COMPANY") {
    const actorCompanies =
      options?.actorCompanyIds ??
      (await getAccessibleCompanyIds(adminPb, actorUserId, actor));
    if (actorCompanies.length === 0) return false;
    const targetCompanies = await getAccessibleCompanyIds(
      adminPb,
      target.userId,
      target.targetUser as Record<string, unknown> | undefined,
    );
    return targetCompanies.some((id) => actorCompanies.includes(id));
  }

  return false;
}

export async function assertActorCanAccessTarget(
  adminPb: PocketBase,
  actor: AuthUserShape,
  actorUserId: string,
  capability: EmployeeCapability,
  target: EmployeeTargetContext,
  message = "Akses ditolak untuk karyawan ini.",
  options?: {
    accessContext?: UserAccessContext | null;
    actorCompanyIds?: string[];
  },
): Promise<void> {
  const ok = await canActorAccessTargetUser(
    adminPb,
    actor,
    actorUserId,
    capability,
    target,
    options,
  );
  if (!ok) throw new HrApiError(message, 403);
}

export function scopeLabel(scope: EmployeeDataScope): string {
  switch (scope) {
    case "OWN":
      return "Data sendiri";
    case "MANAGED_EMPLOYEES":
      return "Tim yang dikelola";
    case "COMPANY":
      return "Seluruh perusahaan";
    default:
      return scope;
  }
}
