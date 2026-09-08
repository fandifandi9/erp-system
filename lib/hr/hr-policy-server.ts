/**
 * Phase 34E — HR policy server (entity-scoped, server-authoritative).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { isCompanyInScope } from "@/lib/hr/company-scope";
import { hasHrPolicyCapability } from "@/lib/capabilities/hr-policy";
import { fetchPrimaryAdministrativeEntityForUser } from "@/lib/hr/profile-primary-entity";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { notifyHrPolicyPublished, notifyHrPolicyUpdated } from "@/lib/notifications/hr-dispatch";
import {
  buildAbsenceExampleText,
  buildLateExampleText,
} from "@/lib/hr/entity-attendance-policy-types";
import {
  policyToDeductionRates,
  resolveEffectiveEntityAttendancePolicy,
} from "@/lib/hr/entity-attendance-policy";

import {
  HR_POLICY_CATEGORIES,
  hrPolicyCategoryLabel,
  type HrPolicyCategory,
  type HrPolicyDto,
} from "@/lib/hr/hr-policy-types";

export { HR_POLICY_CATEGORIES, hrPolicyCategoryLabel, type HrPolicyCategory, type HrPolicyDto };

export const HR_POLICIES_COLLECTION = "hr_policies";

function hasEffectiveHrPolicyCapability(
  ctx: HrApiAuthContext,
  cap: "hr_policy.view_published" | "hr_policy.manage",
): boolean {
  return hasEffectiveCapability(
    ctx.user,
    ctx.accessContext,
    cap,
    hasHrPolicyCapability(ctx.user, cap),
  );
}

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function mapPolicyRow(r: Record<string, unknown>, companyName?: string): HrPolicyDto {
  return {
    id: String(r.id),
    title: String(r.title ?? "").trim() || "—",
    category: String(r.category ?? "kehadiran") as HrPolicyCategory,
    content: String(r.content ?? "").trim(),
    status: String(r.status ?? "draft"),
    effective_from: String(r.effective_from ?? "").slice(0, 10),
    updated: String(r.updated ?? r.published_at ?? ""),
    company_id: String(r.company_id ?? "").trim() || undefined,
    company_name: companyName,
  };
}

async function resolveUserPrimaryCompanyId(
  adminPb: PocketBase,
  userId: string,
): Promise<{ companyId: string | null; companyName: string }> {
  const primary = await fetchPrimaryAdministrativeEntityForUser(adminPb, userId);
  return {
    companyId: primary.company_id ?? null,
    companyName: primary.company_name || primary.label || "—",
  };
}

async function buildPolicyExamples(
  adminPb: PocketBase,
  userId: string,
): Promise<{ late?: string; absence?: string }> {
  try {
    const { companyId } = await resolveUserPrimaryCompanyId(adminPb, userId);
    const policy = await resolveEffectiveEntityAttendancePolicy(
      adminPb,
      companyId,
      new Date().toISOString().slice(0, 10),
    );
    if (!policy) return {};
    const rates = policyToDeductionRates(policy);
    return {
      late: buildLateExampleText(rates),
      absence: buildAbsenceExampleText(rates),
    };
  } catch {
    return {};
  }
}

export async function listPublishedPoliciesForUser(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<HrPolicyDto[]> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.view_published")) {
    throw new HrApiError("Akses kebijakan HR ditolak.", 403);
  }

  const { companyId, companyName } = await resolveUserPrimaryCompanyId(adminPb, ctx.userId);
  const companyFilter = companyId
    ? `(company_id = "${pbEscape(companyId)}" || company_id = "")`
    : `(company_id = "" || company_id = null)`;

  const rows = await adminPb.collection(HR_POLICIES_COLLECTION).getFullList({
    filter: `status = "published" && ${companyFilter}`,
    sort: "category,effective_from",
    requestKey: null,
  });

  const examples = await buildPolicyExamples(adminPb, ctx.userId);
  return rows.map((r) => {
    const dto = mapPolicyRow(r as Record<string, unknown>, companyName);
    if (dto.category === "keterlambatan" && examples.late) {
      dto.example_note = examples.late;
    }
    if (dto.category === "ketidakhadiran" && examples.absence) {
      dto.example_note = examples.absence;
    }
    return dto;
  });
}

export async function listManageablePolicies(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<HrPolicyDto[]> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.manage")) {
    throw new HrApiError("Akses kelola kebijakan ditolak.", 403);
  }

  let filter = "";
  const opsCompanies = await getHrOperationalCompanyIds(adminPb, ctx);
  if (!ctx.isOwner && opsCompanies.length > 0) {
    const parts = opsCompanies.map((id) => `company_id = "${pbEscape(id)}"`);
    parts.push(`company_id = ""`);
    filter = `(${parts.join(" || ")})`;
  }

  const rows = await adminPb.collection(HR_POLICIES_COLLECTION).getFullList({
    filter: filter || undefined,
    sort: "-updated",
    requestKey: null,
  });
  return rows.map((r) => mapPolicyRow(r as Record<string, unknown>));
}

export async function upsertHrPolicy(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    id?: string;
    title: string;
    category: string;
    content: string;
    company_id?: string;
    effective_from?: string;
    publish?: boolean;
  },
): Promise<HrPolicyDto> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.manage")) {
    throw new HrApiError("Akses kelola kebijakan ditolak.", 403);
  }

  const companyId = String(input.company_id ?? "").trim();
  if (companyId && !ctx.isOwner) {
    const { assertHrOperationalEntityAccess } = await import(
      "@/lib/org/resolve-hr-operational-company-scope"
    );
    await assertHrOperationalEntityAccess(adminPb, ctx, companyId);
  }

  const payload: Record<string, unknown> = {
    title: input.title.trim(),
    category: input.category,
    content: input.content.trim(),
    company_id: companyId || "",
    effective_from: input.effective_from?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    updated_by: ctx.userId,
  };

  if (input.publish) {
    payload.status = "published";
    payload.published_by = ctx.userId;
    payload.published_at = new Date().toISOString().slice(0, 10);
  }

  let record: Record<string, unknown>;
  const isUpdate = Boolean(input.id?.trim());

  if (isUpdate) {
    record = (await adminPb.collection(HR_POLICIES_COLLECTION).update(input.id!, payload, {
      requestKey: null,
    })) as Record<string, unknown>;
  } else {
    payload.created_by = ctx.userId;
    payload.status = input.publish ? "published" : "draft";
    record = (await adminPb.collection(HR_POLICIES_COLLECTION).create(payload, {
      requestKey: null,
    })) as Record<string, unknown>;
  }

  await emitBusinessEventServer(adminPb, {
    event_code: input.publish ? "hr_policy.published" : "hr_policy.updated",
    module: "hr",
    entity_type: "hr_policy",
    entity_id: String(record.id),
    entity_label: String(record.title ?? ""),
    actor_id: ctx.userId,
    severity: "info",
    payload: { category: record.category, company_id: record.company_id || undefined },
  });

  if (input.publish) {
    await notifyHrPolicyPublished(adminPb, {
      policyId: String(record.id),
      companyId: companyId || undefined,
      title: String(record.title ?? ""),
    });
  } else if (isUpdate && String(record.status) === "published") {
    await notifyHrPolicyUpdated(adminPb, {
      policyId: String(record.id),
      companyId: companyId || undefined,
      title: String(record.title ?? ""),
    });
  }

  return mapPolicyRow(record);
}

export async function assertPolicyCompanyScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  policyId: string,
): Promise<Record<string, unknown>> {
  let record: Record<string, unknown>;
  try {
    record = (await adminPb.collection(HR_POLICIES_COLLECTION).getOne(policyId, {
      requestKey: null,
    })) as Record<string, unknown>;
  } catch {
    throw new HrApiError("Kebijakan tidak ditemukan.", 404);
  }

  if (String(record.status) === "published") {
    if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.view_published")) {
      throw new HrApiError("Akses ditolak.", 403);
    }
    const companyId = String(record.company_id ?? "");
    if (companyId && !ctx.isOwner) {
      const { companyId: primaryId } = await resolveUserPrimaryCompanyId(adminPb, ctx.userId);
      if (primaryId && companyId !== primaryId) {
        throw new HrApiError("Kebijakan di luar entitas Anda.", 403);
      }
      if (!primaryId && !isCompanyInScope(companyId, await getHrOperationalCompanyIds(adminPb, ctx))) {
        throw new HrApiError("Kebijakan di luar entitas Anda.", 403);
      }
    }
    return record;
  }

  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.manage")) {
    throw new HrApiError("Akses ditolak.", 403);
  }
  const companyId = String(record.company_id ?? "");
  if (companyId && !ctx.isOwner && !isCompanyInScope(companyId, await getHrOperationalCompanyIds(adminPb, ctx))) {
    throw new HrApiError("Kebijakan di luar scope entitas.", 403);
  }
  return record;
}
