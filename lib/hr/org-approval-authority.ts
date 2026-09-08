/**
 * Shared org-hierarchy approval gate (Leave / Izin-Off / Field Activity).
 * Self-deny · company overlap · multi-holder positionsUnderOrgAuthority.
 * Owner bypass. Legacy no-seat → optional HR admin surface.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import { assertHrAdminSurface } from "@/lib/access/hr-api-enforcement";
import {
  listActiveOrgAssignments,
  listActiveHoldersForPosition,
} from "@/lib/hr/org-assignment-server";
import { positionsUnderOrgAuthority, type OrgPositionGraphNode } from "@/lib/hr/org-authority";
import { HR_ORG_POSITIONS_COLLECTION } from "@/lib/hr/org-position-types";

export type OrgApprovalOptions = {
  /** Error code when self-approve attempted */
  selfApproveCode?: string;
  /** Error code when org authority missing */
  orgAuthorityCode?: string;
  /**
   * When subject has no org seat: allow classic HR admin surface (leave legacy).
   * Default true. Set false to fail closed without seat.
   */
  allowHrAdminFallback?: boolean;
};

/**
 * Assert actor may approve/reject a workflow for subjectUserId.
 * Does not grant authority from jabatan title strings.
 */
export async function assertOrgHierarchyApprover(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  subjectUserId: string,
  options?: OrgApprovalOptions,
): Promise<void> {
  const selfCode = options?.selfApproveCode ?? "SELF_APPROVE_DENIED";
  const orgCode = options?.orgAuthorityCode ?? "ORG_AUTHORITY_REQUIRED";
  const allowFallback = options?.allowHrAdminFallback !== false;

  if (!subjectUserId) throw new HrApiError("Subjek tidak valid.", 400);
  if (ctx.userId === subjectUserId) {
    throw new HrApiError(
      "Tidak boleh menyetujui/menolak pengajuan sendiri.",
      403,
      selfCode,
    );
  }

  if (ctx.isOwner) return;

  const actorCompanies = ctx.companyIds?.length
    ? ctx.companyIds
    : await getAccessibleCompanyIds(adminPb, ctx.userId);
  const subjectCompanies = await getAccessibleCompanyIds(adminPb, subjectUserId);
  if (!subjectCompanies.length || !actorCompanies.some((id) => subjectCompanies.includes(id))) {
    throw new HrApiError("Akses lintas entitas ditolak.", 403);
  }

  const assignments = await listActiveOrgAssignments(adminPb, subjectUserId);
  if (assignments.length === 0) {
    if (allowFallback) {
      assertHrAdminSurface(ctx);
      return;
    }
    throw new HrApiError(
      "Karyawan tanpa posisi organisasi aktif — tidak dapat diproses.",
      403,
      orgCode,
    );
  }

  const posRows = await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).getFullList({
    requestKey: null,
  });
  const flat: OrgPositionGraphNode[] = [];
  for (const raw of posRows) {
    const id = String((raw as { id?: string }).id ?? "");
    if (!id) continue;
    const parent =
      typeof (raw as { parent_position?: string }).parent_position === "string"
        ? String((raw as { parent_position?: string }).parent_position)
        : null;
    const holders = await listActiveHoldersForPosition(adminPb, id);
    flat.push({
      id,
      parentPositionId: parent,
      holderUserIds: holders.map((h) => h.userId),
      holderUserId: holders[0]?.userId ?? null,
    });
  }

  const managed = positionsUnderOrgAuthority(flat, ctx.userId);
  const subjectPos = assignments.map((a) => a.orgPositionId).filter(Boolean);
  if (subjectPos.some((pid) => managed.has(pid))) return;

  throw new HrApiError(
    "Hanya atasan hierarki (atau Owner) yang dapat memproses pengajuan ini. Akses modul HR saja tidak cukup.",
    403,
    orgCode,
  );
}

/** Soft check — true if assertOrgHierarchyApprover would pass. */
export async function canOrgHierarchyApprove(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  subjectUserId: string,
  options?: OrgApprovalOptions,
): Promise<boolean> {
  try {
    await assertOrgHierarchyApprover(adminPb, ctx, subjectUserId, options);
    return true;
  } catch {
    return false;
  }
}
