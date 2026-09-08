/**
 * Phase 35I-J — Recruitment appointment approval (server).
 *
 * Approver is derived from organization hierarchy (canAssignPositionHolder),
 * never chosen by Staff HR. HR module ≠ approval authority.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { isHrOperationalActor } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { canAssignPositionHolder } from "@/lib/hr/org-authority";
import {
  HR_RECRUITMENT_REQUESTS_COLLECTION,
  parseRecruitmentStatus,
  type RecruitmentRequestRecord,
  type RecruitmentStatus,
} from "@/lib/hr/recruitment-request-types";
import {
  serverGetOrgPosition,
  serverListOrgPositions,
} from "@/lib/hr/org-position-server";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function relationId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && "id" in raw) {
    const id = String((raw as { id: unknown }).id ?? "").trim();
    return id || null;
  }
  return null;
}

function mapRequest(rec: Record<string, unknown>): RecruitmentRequestRecord {
  return {
    id: String(rec.id),
    candidateUserId: relationId(rec.candidate_user) || "",
    candidateName: String(rec.candidate_name ?? ""),
    candidateEmail: String(rec.candidate_email ?? ""),
    companyId: relationId(rec.company) || "",
    orgPositionId: relationId(rec.org_position) || "",
    orgPositionName: String(rec.org_position_name ?? ""),
    profileId: relationId(rec.profile),
    requestedBy: relationId(rec.requested_by) || "",
    status: parseRecruitmentStatus(rec.status),
    reviewedBy: relationId(rec.reviewed_by),
    reviewedAt: rec.reviewed_at ? String(rec.reviewed_at) : null,
    decision: String(rec.decision ?? ""),
    rejectionReason: String(rec.rejection_reason ?? ""),
    notes: String(rec.notes ?? ""),
    created: String(rec.created ?? ""),
    updated: String(rec.updated ?? ""),
  };
}

async function buildFlatForAuthority(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  companyId: string,
) {
  const listed = await serverListOrgPositions(adminPb, ctx, companyId).catch(() => []);
  return listed.map((p) => ({
    id: p.id,
    parentPositionId: p.parentPositionId,
    holderUserId: p.holderUserId,
    holderUserIds: p.holderUserIds,
  }));
}

/**
 * True when actor may appoint to the request's target position (hierarchy),
 * and is not the requester (no self-approve).
 */
export async function actorCanApproveRecruitmentRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  request: RecruitmentRequestRecord,
): Promise<boolean> {
  if (!isHrOperationalActor(ctx) && !ctx.isOwner) return false;
  if (request.requestedBy && request.requestedBy === ctx.userId) return false;
  if (request.status !== "PENDING") return false;

  const pos = await serverGetOrgPosition(adminPb, request.orgPositionId);
  if (!pos || !pos.isActive) return false;

  const parent = pos.parentPositionId
    ? await serverGetOrgPosition(adminPb, pos.parentPositionId)
    : null;
  const flat = await buildFlatForAuthority(adminPb, ctx, request.companyId || pos.companyId);
  if (!flat.some((p) => p.id === pos.id)) {
    flat.push({
      id: pos.id,
      parentPositionId: pos.parentPositionId,
      holderUserId: pos.holderUserId,
      holderUserIds: pos.holderUserIds,
    });
  }
  if (parent && !flat.some((p) => p.id === parent.id)) {
    flat.push({
      id: parent.id,
      parentPositionId: parent.parentPositionId,
      holderUserId: parent.holderUserId,
      holderUserIds: parent.holderUserIds,
    });
  }

  return canAssignPositionHolder(ctx, pos, parent, flat);
}

export type CreateRecruitmentRequestInput = {
  candidateUserId: string;
  candidateName: string;
  candidateEmail: string;
  companyId: string;
  orgPositionId: string;
  orgPositionName: string;
  profileId?: string | null;
  notes?: string;
};

export async function createPendingRecruitmentRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: CreateRecruitmentRequestInput,
): Promise<RecruitmentRequestRecord> {
  const body = {
    candidate_user: input.candidateUserId,
    candidate_name: input.candidateName.trim(),
    candidate_email: input.candidateEmail.trim().toLowerCase(),
    company: input.companyId,
    org_position: input.orgPositionId,
    org_position_name: input.orgPositionName.trim(),
    profile: input.profileId || "",
    requested_by: ctx.userId,
    status: "PENDING" as RecruitmentStatus,
    reviewed_by: "",
    reviewed_at: "",
    decision: "",
    rejection_reason: "",
    notes: String(input.notes ?? "").trim(),
  };

  const created = (await adminPb.collection(HR_RECRUITMENT_REQUESTS_COLLECTION).create(body, {
    requestKey: null,
  })) as unknown as Record<string, unknown>;
  return mapRequest(created);
}

export async function serverGetRecruitmentRequest(
  adminPb: PocketBase,
  id: string,
): Promise<RecruitmentRequestRecord | null> {
  try {
    const rec = (await adminPb.collection(HR_RECRUITMENT_REQUESTS_COLLECTION).getOne(id.trim(), {
      requestKey: null,
    })) as unknown as Record<string, unknown>;
    return mapRequest(rec);
  } catch {
    return null;
  }
}

/**
 * Pending requests the actor is authorized to approve (hierarchy-derived).
 * Owner sees all pending in working/authorized scope; others only if canAssign.
 */
export async function serverListPendingRecruitmentForApprover(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<RecruitmentRequestRecord[]> {
  if (!isHrOperationalActor(ctx) && !ctx.isOwner) {
    throw new HrApiError("Akses ditolak.", 403);
  }

  const operational = await getHrOperationalCompanyIds(adminPb, ctx);
  let filter = `status = "PENDING"`;
  if (!ctx.isOwner) {
    if (operational.length === 0) return [];
    const companyFilter = operational.map((id) => `company = "${pbEscape(id)}"`).join(" || ");
    filter = `${filter} && (${companyFilter})`;
  }

  let rows: Record<string, unknown>[] = [];
  try {
    rows = (await adminPb.collection(HR_RECRUITMENT_REQUESTS_COLLECTION).getFullList({
      filter,
      sort: "-created",
      requestKey: null,
    })) as unknown as Record<string, unknown>[];
  } catch {
    return [];
  }

  const mapped = rows.map(mapRequest);
  const out: RecruitmentRequestRecord[] = [];
  for (const req of mapped) {
    if (await actorCanApproveRecruitmentRequest(adminPb, ctx, req)) {
      out.push(req);
    }
  }
  return out;
}

export async function serverApproveRecruitmentRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
): Promise<RecruitmentRequestRecord> {
  const req = await serverGetRecruitmentRequest(adminPb, requestId);
  if (!req) throw new HrApiError("Permohonan recruitment tidak ditemukan.", 404);
  if (req.status === "APPROVED") {
    throw new HrApiError("Permohonan sudah disetujui.", 409, "RECRUITMENT_ALREADY_APPROVED");
  }
  if (req.status === "REJECTED") {
    throw new HrApiError("Permohonan sudah ditolak.", 409, "RECRUITMENT_ALREADY_REJECTED");
  }
  if (!(await actorCanApproveRecruitmentRequest(adminPb, ctx, req))) {
    throw new HrApiError(
      "Anda tidak berwenang menyetujui pengangkatan ini (otoritas hierarki wajib).",
      403,
      "RECRUITMENT_APPROVE_DENIED",
    );
  }

  const { createOrgAssignment } = await import("@/lib/hr/org-assignment-server");
  await createOrgAssignment(adminPb, ctx, {
    userId: req.candidateUserId,
    companyId: req.companyId,
    orgPositionId: req.orgPositionId,
  });

  const now = new Date().toISOString();
  const updated = (await adminPb.collection(HR_RECRUITMENT_REQUESTS_COLLECTION).update(
    req.id,
    {
      status: "APPROVED",
      reviewed_by: ctx.userId,
      reviewed_at: now,
      decision: "APPROVED",
      rejection_reason: "",
    },
    { requestKey: null },
  )) as unknown as Record<string, unknown>;

  return mapRequest(updated);
}

export async function serverRejectRecruitmentRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
  reason: string,
): Promise<RecruitmentRequestRecord> {
  const req = await serverGetRecruitmentRequest(adminPb, requestId);
  if (!req) throw new HrApiError("Permohonan recruitment tidak ditemukan.", 404);
  if (req.status === "APPROVED") {
    throw new HrApiError("Permohonan sudah disetujui.", 409, "RECRUITMENT_ALREADY_APPROVED");
  }
  if (req.status === "REJECTED") {
    throw new HrApiError("Permohonan sudah ditolak.", 409, "RECRUITMENT_ALREADY_REJECTED");
  }
  if (!(await actorCanApproveRecruitmentRequest(adminPb, ctx, req))) {
    throw new HrApiError(
      "Anda tidak berwenang menolak pengangkatan ini (otoritas hierarki wajib).",
      403,
      "RECRUITMENT_APPROVE_DENIED",
    );
  }

  const reasonTrim = String(reason ?? "").trim();
  if (!reasonTrim) {
    throw new HrApiError("Alasan penolakan wajib diisi.", 400);
  }

  const now = new Date().toISOString();
  const updated = (await adminPb.collection(HR_RECRUITMENT_REQUESTS_COLLECTION).update(
    req.id,
    {
      status: "REJECTED",
      reviewed_by: ctx.userId,
      reviewed_at: now,
      decision: "REJECTED",
      rejection_reason: reasonTrim,
    },
    { requestKey: null },
  )) as unknown as Record<string, unknown>;

  return mapRequest(updated);
}

/** Count pending actionable by actor (for Meja Kerja badge). Failures must not look like zero. */
export async function countPendingRecruitmentForApprover(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<number> {
  try {
    const list = await serverListPendingRecruitmentForApprover(adminPb, ctx);
    return list.length;
  } catch (err) {
    throw new HrApiError(
      err instanceof Error ? err.message : "Gagal memuat antrian rekrutmen.",
      503,
      "DESK_RECRUITMENT_COUNT_FAILED",
    );
  }
}
