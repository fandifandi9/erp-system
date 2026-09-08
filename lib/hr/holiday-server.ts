/**
 * Phase 34E — Company holidays server (entity-scoped reads).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { assertCompanyInScope } from "@/lib/hr/company-scope";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import { assertHrModuleEntityAccess } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { hasHrPolicyCapability } from "@/lib/capabilities/hr-policy";
import { fetchPrimaryAdministrativeEntityForUser } from "@/lib/hr/profile-primary-entity";
import { OFFICE_HOLIDAYS_COLLECTION } from "@/lib/work-calendar";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { notifyHolidayCreated, notifyHolidayUpdated } from "@/lib/notifications/hr-dispatch";
import { holidayTypeLabel, type HolidayDto } from "@/lib/hr/hr-policy-types";

export { holidayTypeLabel, type HolidayDto };

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

function mapHolidayRow(r: Record<string, unknown>, companyName?: string): HolidayDto {
  return {
    id: String(r.id),
    date: String(r.date ?? "").slice(0, 10),
    name: String(r.name ?? "").trim() || "Hari Libur",
    holiday_type: String(r.holiday_type ?? "company"),
    description: String(r.description ?? "").trim() || undefined,
    company_id: String(r.company_id ?? "").trim() || undefined,
    company_name: companyName,
    is_active: r.is_active !== false,
  };
}

async function resolveUserPrimaryCompany(
  adminPb: PocketBase,
  userId: string,
): Promise<{ companyId: string | null; companyName: string }> {
  const primary = await fetchPrimaryAdministrativeEntityForUser(adminPb, userId);
  return {
    companyId: primary.company_id ?? null,
    companyName: primary.company_name || primary.label || "—",
  };
}

export async function listHolidaysForUser(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  opts?: { from?: string; to?: string },
): Promise<HolidayDto[]> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.view_published")) {
    throw new HrApiError("Akses kalender libur ditolak.", 403);
  }

  const { companyId, companyName } = await resolveUserPrimaryCompany(adminPb, ctx.userId);
  const companyFilter = companyId
    ? `(company_id = "${pbEscape(companyId)}" || company_id = "" || company_id = null)`
    : `(company_id = "" || company_id = null)`;

  let filter = `is_active = true && ${companyFilter}`;
  if (opts?.from) filter += ` && date >= "${pbEscape(opts.from.slice(0, 10))}"`;
  if (opts?.to) filter += ` && date <= "${pbEscape(opts.to.slice(0, 10))}"`;

  const rows = await adminPb.collection(OFFICE_HOLIDAYS_COLLECTION).getFullList({
    filter,
    sort: "date",
    requestKey: null,
  });

  return rows.map((r) => mapHolidayRow(r as Record<string, unknown>, companyName));
}

export async function upsertHoliday(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    id?: string;
    date: string;
    name: string;
    holiday_type?: string;
    description?: string;
    company_id?: string;
    is_active?: boolean;
  },
): Promise<HolidayDto> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.manage")) {
    throw new HrApiError("Akses kelola hari libur ditolak.", 403);
  }

  const companyId = String(input.company_id ?? "").trim();
  if (companyId && !ctx.isOwner) {
    assertHrModuleEntityAccess(ctx, companyId);
  }

  const payload: Record<string, unknown> = {
    date: input.date.slice(0, 10),
    name: input.name.trim(),
    holiday_type: input.holiday_type || "company",
    description: input.description?.trim() || "",
    company_id: companyId || "",
    is_active: input.is_active !== false,
  };

  let record: Record<string, unknown>;
  const isUpdate = Boolean(input.id?.trim());

  if (isUpdate) {
    record = (await adminPb.collection(OFFICE_HOLIDAYS_COLLECTION).update(input.id!, payload, {
      requestKey: null,
    })) as Record<string, unknown>;
    await emitBusinessEventServer(adminPb, {
      event_code: "hr_holiday.updated",
      module: "hr",
      entity_type: "office_holiday",
      entity_id: String(record.id),
      entity_label: String(record.name ?? ""),
      actor_id: ctx.userId,
      severity: "info",
      payload: { date: record.date, company_id: record.company_id || undefined },
    });
    await notifyHolidayUpdated(adminPb, {
      holidayId: String(record.id),
      companyId: companyId || undefined,
      date: String(record.date ?? ""),
      name: String(record.name ?? ""),
    });
  } else {
    record = (await adminPb.collection(OFFICE_HOLIDAYS_COLLECTION).create(payload, {
      requestKey: null,
    })) as Record<string, unknown>;
    await emitBusinessEventServer(adminPb, {
      event_code: "hr_holiday.created",
      module: "hr",
      entity_type: "office_holiday",
      entity_id: String(record.id),
      entity_label: String(record.name ?? ""),
      actor_id: ctx.userId,
      severity: "info",
      payload: { date: record.date, company_id: record.company_id || undefined },
    });
    await notifyHolidayCreated(adminPb, {
      holidayId: String(record.id),
      companyId: companyId || undefined,
      date: String(record.date ?? ""),
      name: String(record.name ?? ""),
    });
  }

  return mapHolidayRow(record);
}

export async function listManageableHolidays(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<HolidayDto[]> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.manage")) {
    throw new HrApiError("Akses kelola hari libur ditolak.", 403);
  }

  let filter = "";
  const effectiveCompanies = await getHrOperationalCompanyIds(adminPb, ctx);
  if (!ctx.isOwner && effectiveCompanies.length > 0) {
    const parts = effectiveCompanies.map((id) => `company_id = "${pbEscape(id)}"`);
    parts.push(`company_id = ""`);
    filter = `(${parts.join(" || ")})`;
  } else if (!ctx.isOwner && effectiveCompanies.length === 0) {
    return [];
  }

  const rows = await adminPb.collection(OFFICE_HOLIDAYS_COLLECTION).getFullList({
    filter: filter || undefined,
    sort: "date",
    requestKey: null,
  });
  return rows.map((r) => mapHolidayRow(r as Record<string, unknown>));
}
