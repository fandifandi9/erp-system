/**
 * Phase 35I-H/I — Recruitment target positions vs organization appointment.
 *
 * RECRUITMENT (administrative): Staff HR may select any active company position as target.
 * APPOINTMENT (org authority): only Owner / hierarchy can create active org assignment.
 *
 * HR module ≠ organization authority.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { isHrOperationalActor, getHrEffectiveCompanyIds } from "@/lib/access/hr-api-enforcement";
import { assertEmployeeCapability } from "@/lib/hr/employee-auth";
import {
  buildOrgStructureActorCapabilities,
  canAssignPositionHolder,
  canEstablishChildUnderParent,
} from "@/lib/hr/org-authority";
import {
  deriveSuperiorFromPosition,
  serverGetOrgPosition,
  serverListOrgPositions,
} from "@/lib/hr/org-position-server";
import { companyInPositionScope } from "@/lib/hr/org-position-scope";
import type { OrgPositionRecord } from "@/lib/hr/org-position-types";

export type RecruitablePositionDto = {
  id: string;
  name: string;
  companyId: string;
  parentPositionId: string | null;
  parentName: string | null;
  department: string;
  division: string;
  label: string;
  breadcrumb: string[];
  superiorUserId: string | null;
  superiorName: string | null;
  parentVacant: boolean;
  /** Active holders already on this seat (multi-holder OK). */
  holderCount: number;
  /** Actor may create active org assignment for this position now. */
  appointmentEligible: boolean;
};

function buildBreadcrumb(
  pos: OrgPositionRecord,
  byId: Map<string, OrgPositionRecord>,
): string[] {
  const chain: string[] = [];
  let cur: OrgPositionRecord | undefined = pos;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    chain.unshift(cur.name);
    cur = cur.parentPositionId ? byId.get(cur.parentPositionId) : undefined;
  }
  return chain;
}

/**
 * List active positions usable as recruitment TARGETS (company-scoped).
 * Does NOT require canAssignPositionHolder — that is appointment authority.
 */
export async function serverListRecruitablePositions(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  options?: { companyId?: string | null },
): Promise<{
  items: RecruitablePositionDto[];
  modeConfigured: boolean;
  mode: string | null;
  canExpandStructure: boolean;
}> {
  if (!isHrOperationalActor(ctx)) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }
  assertEmployeeCapability(ctx, "employee.create");

  // FLEX-ORG-04 — no global mode gate; list from authorized companies.
  const requested = String(options?.companyId ?? "").trim() || null;
  const positions = await serverListOrgPositions(adminPb, ctx, requested);
  const byId = new Map(positions.map((p) => [p.id, p]));
  const flat = positions.map((p) => ({
    id: p.id,
    parentPositionId: p.parentPositionId,
    holderUserId: p.holderUserId,
    holderUserIds: p.holderUserIds,
  }));

  const caps = buildOrgStructureActorCapabilities(ctx, flat);
  const canExpandStructure =
    caps.canCreateRoot || positions.some((p) => canEstablishChildUnderParent(ctx, p, flat));

  const authorized = getHrEffectiveCompanyIds(ctx);
  const items: RecruitablePositionDto[] = [];
  for (const pos of positions) {
    if (!pos.isActive) continue;
    if (requested && !companyInPositionScope(requested, pos, authorized)) {
      continue;
    }

    const parent = pos.parentPositionId ? byId.get(pos.parentPositionId) ?? null : null;
    const appointmentEligible = canAssignPositionHolder(ctx, pos, parent, flat);
    const breadcrumb = buildBreadcrumb(pos, byId);
    const superior = await deriveSuperiorFromPosition(adminPb, pos.id);
    const parentName = parent?.name ?? superior.parentPositionName;
    const holderCount = pos.holderCount ?? (pos.holderUserId ? 1 : 0);
    const label = parentName
      ? `${pos.name} — di bawah ${parentName}${holderCount ? ` (${holderCount} orang)` : ""}`
      : `${pos.name}${holderCount ? ` (${holderCount} orang)` : ""}`;

    items.push({
      id: pos.id,
      name: pos.name,
      companyId: pos.companyId,
      parentPositionId: pos.parentPositionId,
      parentName: parentName ?? null,
      department: String(pos.department || ""),
      division: String(pos.division || ""),
      label,
      breadcrumb,
      superiorUserId: superior.superiorUserId,
      superiorName: superior.superiorName,
      parentVacant: Boolean(pos.parentPositionId && !superior.superiorUserId),
      holderCount,
      appointmentEligible,
    });
  }

  items.sort((a, b) => a.breadcrumb.join("\0").localeCompare(b.breadcrumb.join("\0"), "id"));
  return {
    items,
    modeConfigured: true,
    mode: null,
    canExpandStructure,
  };
}

/**
 * Validate position for APPOINTMENT (active org assignment).
 * Used when actor has hierarchy authority — not for administrative recruitment alone.
 */
export async function assertAppointablePositionForCreate(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  orgPositionId: string,
  companyId: string,
): Promise<OrgPositionRecord> {
  const posId = String(orgPositionId || "").trim();
  const cid = String(companyId || "").trim();
  if (!posId) {
    throw new HrApiError("Jabatan / posisi organisasi wajib dipilih.", 400);
  }
  if (!cid) {
    throw new HrApiError("Entitas administratif wajib dipilih.", 400);
  }

  const pos = await serverGetOrgPosition(adminPb, posId);
  if (!pos || !pos.isActive) {
    throw new HrApiError("Jabatan organisasi tidak valid atau nonaktif.", 400);
  }

  const authorized = getHrEffectiveCompanyIds(ctx);
  if (!companyInPositionScope(cid, pos, authorized)) {
    throw new HrApiError(
      "Posisi tidak mencakup entitas yang dipilih.",
      403,
      "ORG_RECRUIT_COMPANY_MISMATCH",
    );
  }

  const positions = await serverListOrgPositions(adminPb, ctx, null);
  const byId = new Map(positions.map((p) => [p.id, p]));
  const flat = positions.map((p) => ({
    id: p.id,
    parentPositionId: p.parentPositionId,
    holderUserId: p.holderUserId,
    holderUserIds: p.holderUserIds,
  }));
  const parent = pos.parentPositionId
    ? (byId.get(pos.parentPositionId) ?? (await serverGetOrgPosition(adminPb, pos.parentPositionId)))
    : null;

  if (!canAssignPositionHolder(ctx, pos, parent, flat)) {
    throw new HrApiError(
      "Anda tidak berwenang mengangkat (appointment) ke jabatan ini. Recruitment administratif ≠ otoritas organisasi.",
      403,
      "ORG_APPOINTMENT_DENIED",
    );
  }

  return pos;
}

/** @deprecated Use assertAppointablePositionForCreate — kept name for callers. */
export const assertRecruitablePositionForCreate = assertAppointablePositionForCreate;

/**
 * Validate position exists + company match for recruitment TARGET (no appointment check).
 */
export async function assertRecruitmentTargetPosition(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  orgPositionId: string,
  companyId: string,
): Promise<OrgPositionRecord> {
  const posId = String(orgPositionId || "").trim();
  const cid = String(companyId || "").trim();
  if (!posId) {
    throw new HrApiError("Jabatan / posisi organisasi wajib dipilih.", 400);
  }
  if (!cid) {
    throw new HrApiError("Entitas administratif wajib dipilih.", 400);
  }

  const pos = await serverGetOrgPosition(adminPb, posId);
  if (!pos || !pos.isActive) {
    throw new HrApiError("Jabatan organisasi tidak valid atau nonaktif.", 400);
  }
  const authorized = getHrEffectiveCompanyIds(ctx);
  if (!companyInPositionScope(cid, pos, authorized)) {
    throw new HrApiError(
      "Posisi tidak mencakup entitas yang dipilih.",
      403,
      "ORG_RECRUIT_COMPANY_MISMATCH",
    );
  }

  // Must be in actor's listable org scope (company authorized)
  const listed = await serverListOrgPositions(adminPb, ctx, null);
  if (!listed.some((p) => p.id === pos.id) && !ctx.isOwner) {
    throw new HrApiError("Posisi di luar scope entitas Anda.", 403);
  }

  return pos;
}
