/**
 * Phase 35I-B0 — Server-authoritative employee detail for HR edit page.
 * Avoids client PocketBase profiles.listRule (legacy self || hr || owner).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  assertEmployeeCapability,
  assertEmployeeTargetAccess,
  hasEffectiveEmployeeCapability,
  stripSensitiveFields,
} from "@/lib/hr/employee-auth";
import { isHrOperationalActor } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import { hasMasterDataCapability } from "@/lib/capabilities/master-data";
import { PROFILE_MANAGER_FIELD } from "@/lib/hr/employee-scope";
import { listEmployeeMemberships } from "@/lib/master-data/membership";
import {
  getMaxBookingsPerMonth,
  leaveBookingsQuotaFromProfileRecord,
} from "@/lib/leave";
import {
  deriveSuperiorFromPosition,
  serverGetOrgPosition,
  serverListOrgPositions,
} from "@/lib/hr/org-position-server";
import {
  listActiveOrgAssignments,
  resolveOrgContextForUserCompany,
} from "@/lib/hr/org-assignment-server";
import type { OrgAssignmentRecord } from "@/lib/hr/org-assignment-types";
import type { DerivedApprover, DerivedSuperior, OrgPositionRecord } from "@/lib/hr/org-position-types";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function profileManagerUserId(profile: Record<string, unknown> | null): string | null {
  if (!profile) return null;
  const mgr = profile[PROFILE_MANAGER_FIELD];
  if (typeof mgr === "string" && mgr) return mgr;
  if (mgr && typeof mgr === "object" && "id" in mgr) {
    return String((mgr as { id: string }).id);
  }
  return null;
}

export type EmployeeDetailActorCaps = {
  canView: boolean;
  canUpdate: boolean;
  canViewSensitive: boolean;
  canAssignManager: boolean;
  canManageAccounts: boolean;
  canViewEntities: boolean;
  canAssignMembership: boolean;
};

export type EmployeeDetailDto = {
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
    role_code?: string;
    inventory_role?: string;
    hr_role_preset?: string;
    dashboard_access?: boolean;
    status?: string;
  };
  profile: Record<string, unknown> | null;
  profileId: string | null;
  primaryEntityId: string;
  offices: Array<{ id: string; name: string }>;
  /** Phase 35I-D/F3 — assignment SSOT + derived superior (context = working entity). */
  organization: {
    orgPositionId: string | null;
    orgPositionName: string | null;
    derivedSuperior: DerivedSuperior;
    derivedApprover: DerivedApprover | null;
    contextCompanyId: string | null;
    assignmentSource: "assignment" | "profile_fallback" | "none";
    otherAssignments: OrgAssignmentRecord[];
    /** Assignable positions in actor entity scope (for picker). */
    positions: OrgPositionRecord[];
    /** Free manager picker disabled when org position drives reporting line. */
    managerIsDerived: boolean;
    isSelf: boolean;
  };
  actor: EmployeeDetailActorCaps;
  defaults: { leaveBookingsQuota: number };
};

async function loadLatestProfile(
  adminPb: PocketBase,
  userId: string,
): Promise<{ profile: Record<string, unknown> | null; profileId: string | null }> {
  try {
    const rows = await adminPb.collection("profiles").getFullList({
      filter: `user="${pbEscape(userId)}"`,
      sort: "-updated",
      requestKey: null,
    });
    if (rows.length === 0) return { profile: null, profileId: null };
    const profile = rows[0] as unknown as Record<string, unknown>;
    return { profile, profileId: String(profile.id) };
  } catch {
    return { profile: null, profileId: null };
  }
}

async function loadActiveOffices(
  adminPb: PocketBase,
): Promise<Array<{ id: string; name: string }>> {
  try {
    const rows = await adminPb.collection("offices").getFullList({
      filter: "is_active=true",
      sort: "name",
      fields: "id,name",
      requestKey: null,
    });
    return rows.map((r) => ({
      id: String((r as { id: string }).id),
      name: String((r as { name?: string }).name || ""),
    }));
  } catch {
    return [];
  }
}

/**
 * Load one employee for HR detail/edit within effective entity scope.
 */
export async function serverGetEmployeeDetailForHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
): Promise<EmployeeDetailDto> {
  if (!isHrOperationalActor(ctx)) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }
  assertEmployeeCapability(ctx, "employee.view");

  const uid = String(targetUserId || "").trim();
  if (!uid) throw new HrApiError("Karyawan tidak ditemukan.", 404);

  let user: Record<string, unknown>;
  try {
    user = (await adminPb.collection("users").getOne(uid, {
      fields:
        "id,name,email,role,role_code,inventory_role,hr_role_preset,dashboard_access,status,account_type",
      requestKey: null,
    })) as Record<string, unknown>;
  } catch {
    throw new HrApiError("Karyawan tidak ditemukan.", 404);
  }

  const { profile, profileId } = await loadLatestProfile(adminPb, uid);
  const managerUserId = profileManagerUserId(profile);

  await assertEmployeeTargetAccess(adminPb, ctx, "employee.view", {
    userId: uid,
    profileId: profileId || undefined,
    managerUserId,
    targetUser: user,
  });

  const canViewSensitive = hasEffectiveEmployeeCapability(ctx, "employee.view_sensitive");
  const sanitized = profile
    ? (stripSensitiveFields({ ...profile }, canViewSensitive) as Record<string, unknown>)
    : null;

  let primaryEntityId = "";
  try {
    const memberships = await listEmployeeMemberships(adminPb, uid);
    const primary = memberships.find((m) => m.is_primary === true);
    if (primary?.company) primaryEntityId = String(primary.company);
    else if (memberships.length === 1) primaryEntityId = String(memberships[0]!.company || "");
  } catch {
    primaryEntityId = "";
  }

  const offices = await loadActiveOffices(adminPb);

  const workingIds = await getHrOperationalCompanyIds(adminPb, ctx);
  const contextCompanyId = workingIds[0] || primaryEntityId || null;
  const orgCtx = contextCompanyId
    ? await resolveOrgContextForUserCompany(adminPb, uid, contextCompanyId)
    : {
        source: "none" as const,
        assignment: null,
        orgPositionId: null,
        orgPositionName: null,
        superior: {
          parentPositionId: null,
          parentPositionName: null,
          superiorUserId: null,
          superiorName: null,
          vacant: false,
        },
        approver: null,
      };

  let orgPositionId = orgCtx.orgPositionId;
  let orgPositionName = orgCtx.orgPositionName;
  let derivedSuperior = orgCtx.superior;
  if (!orgPositionId) {
    // Absolute fallback for display when no working company context
    orgPositionId = String(profile?.org_position_id ?? "").trim() || null;
    if (orgPositionId) {
      const pos = await serverGetOrgPosition(adminPb, orgPositionId);
      orgPositionName = pos?.name ?? null;
      derivedSuperior = await deriveSuperiorFromPosition(adminPb, orgPositionId);
    }
  }

  const otherAssignments = (await listActiveOrgAssignments(adminPb, uid)).filter(
    (a) => !contextCompanyId || a.companyId !== contextCompanyId,
  );

  const positions = await serverListOrgPositions(
    adminPb,
    ctx,
    contextCompanyId || primaryEntityId || undefined,
  );

  return {
    user: {
      id: String(user.id),
      name: String(user.name || ""),
      email: String(user.email || ""),
      role: user.role != null ? String(user.role) : undefined,
      role_code: user.role_code != null ? String(user.role_code) : undefined,
      inventory_role: user.inventory_role != null ? String(user.inventory_role) : undefined,
      hr_role_preset: user.hr_role_preset != null ? String(user.hr_role_preset) : undefined,
      dashboard_access:
        typeof user.dashboard_access === "boolean" ? user.dashboard_access : undefined,
      status: user.status != null ? String(user.status) : undefined,
    },
    profile: sanitized,
    profileId,
    primaryEntityId,
    offices,
    organization: {
      orgPositionId,
      orgPositionName,
      derivedSuperior,
      derivedApprover: orgCtx.approver,
      contextCompanyId,
      assignmentSource: orgCtx.source,
      otherAssignments,
      positions,
      managerIsDerived: Boolean(orgPositionId),
      isSelf: ctx.userId === uid,
    },
    actor: {
      canView: true,
      canUpdate: hasEffectiveEmployeeCapability(ctx, "employee.update"),
      canViewSensitive,
      canAssignManager: hasEffectiveEmployeeCapability(ctx, "employee.assign_manager"),
      canManageAccounts: hasEffectiveEmployeeCapability(ctx, "employee.manage_accounts"),
      canViewEntities: hasEffectiveCapability(
        ctx.user,
        ctx.accessContext,
        "master_data.entity.view",
        hasMasterDataCapability(ctx.user, "master_data.entity.view"),
      ),
      canAssignMembership: hasEffectiveCapability(
        ctx.user,
        ctx.accessContext,
        "master_data.membership.assign",
        hasMasterDataCapability(ctx.user, "master_data.membership.assign"),
      ),
    },
    defaults: { leaveBookingsQuota: getMaxBookingsPerMonth() },
  };
}

/** Expose leave quota helper for page mapping without importing leave client paths twice. */
export function detailLeaveQuota(profile: Record<string, unknown> | null, fallback: number): number {
  if (!profile) return fallback;
  return leaveBookingsQuotaFromProfileRecord(profile) ?? fallback;
}
