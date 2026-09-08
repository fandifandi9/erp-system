/**
 * Phase 34E — Server-authoritative payslip access (privacy + entity snapshot).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { isCompanyInScope } from "@/lib/hr/company-scope";
import { hasPayslipCapability } from "@/lib/capabilities/payroll";
import { stampPayrollItemEntitySnapshot } from "@/lib/hr/payroll-entity-snapshot";
import { stampPayrollItemBankSnapshot } from "@/lib/hr/payroll-bank-snapshot";
import { fetchEntityLogoDataUrl, resolveEntityLogoFilenameForPayslip } from "@/lib/hr/entity-logo-server";
import { buildPayrollSlipHtml, type PayslipPdfInput } from "@/lib/hr/payroll-slip-pdf";
import { emitPayslipAuditEvent, PAYSLIP_AUDIT_EVENTS } from "@/lib/hr/payroll-audit";
import { assertAccountVerified } from "@/lib/hr/account-verification-server";

const FINAL_STATUSES = new Set(["approved", "paid", "closed"]);

export type StaffPayslipDto = PayslipPdfInput & {
  item_status: string;
  is_demo?: boolean;
};

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function mapItemRow(r: Record<string, unknown>, period: Record<string, unknown>): StaffPayslipDto {
  const periodStatus = String(period.status ?? "").toLowerCase();
  return {
    id: String(r.id),
    period_key: String(period.period_key ?? period.name ?? "").trim() || "-",
    period_status: periodStatus,
    period_start: String(period.start_date ?? "").slice(0, 10),
    period_end: String(period.end_date ?? "").slice(0, 10),
    pay_date: String(period.pay_date ?? "").slice(0, 10),
    employee_name: String(r.employee_name ?? "").trim() || "-",
    position: String(r.position ?? "").trim() || undefined,
    department: String(r.department_snapshot ?? r.division ?? "").trim() || undefined,
    division: String(r.division ?? "").trim() || undefined,
    employee_code: String(r.employee_code_snapshot ?? "").trim() || undefined,
    base_salary: toNum(r.base_salary),
    fixed_allowance: toNum(r.fixed_allowance),
    overtime_amount: toNum(r.overtime_amount),
    attendance_bonus_amount: toNum(r.attendance_bonus_amount),
    attendance_bonus_eligible: r.attendance_bonus_eligible === true,
    attendance_bonus_reason: String(r.attendance_bonus_reason ?? "").trim() || undefined,
    leave_encashment_amount: toNum(r.leave_encashment_amount),
    leave_encashment_reason: String(r.leave_encashment_reason ?? "").trim() || undefined,
    leave_quota_credit_amount: toNum(r.leave_quota_credit_amount),
    leave_quota_credit_reason: String(r.leave_quota_credit_reason ?? "").trim() || undefined,
    extra_bonus_amount: toNum(r.extra_bonus_amount),
    extra_bonus_eligible: r.extra_bonus_eligible === true,
    extra_bonus_reason: String(r.extra_bonus_reason ?? "").trim() || undefined,
    late_deduction: toNum(r.late_deduction),
    absence_deduction: toNum(r.absence_deduction),
    gross_amount: toNum(r.gross_amount),
    total_deduction: toNum(r.total_deduction),
    net_amount: toNum(r.net_amount),
    company_name: String(r.company_name_snapshot ?? "").trim() || "Belum ditentukan",
    company_legal_name: String(r.company_legal_name_snapshot ?? r.company_name_snapshot ?? "").trim() || undefined,
    entity_type: String(r.entity_type_snapshot ?? "").trim() || undefined,
    company_address: String(r.company_address_snapshot ?? "").trim() || undefined,
    company_npwp: String(r.company_npwp_snapshot ?? "").trim() || undefined,
    company_logo_data_url: undefined,
    bank_name: String(r.bank_name_snapshot ?? "").trim() || undefined,
    bank_account_number_snapshot: String(r.bank_account_number_snapshot ?? "").trim() || undefined,
    bank_account_holder_snapshot: String(r.bank_account_holder_snapshot ?? "").trim() || undefined,
    item_status: String(r.status ?? "calculated"),
    is_demo: r.is_demo === true,
  };
}

async function loadPeriodMap(
  adminPb: PocketBase,
  periodIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const id of [...new Set(periodIds.filter(Boolean))]) {
    try {
      const p = (await adminPb.collection("payroll_periods").getOne(id, { requestKey: null })) as Record<
        string,
        unknown
      >;
      map.set(id, p);
    } catch {
      // skip
    }
  }
  return map;
}

export async function listSelfPayslips(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<StaffPayslipDto[]> {
  if (!hasPayslipCapability(ctx.user, "payslip.view_self")) {
    throw new HrApiError("Akses slip gaji ditolak.", 403);
  }

  const rows = await adminPb.collection("payroll_items").getFullList({
    filter: `user = "${pbEscape(ctx.userId)}"`,
    sort: "-created",
    requestKey: null,
  });

  const periodIds = rows.map((r) => String((r as Record<string, unknown>).period ?? ""));
  const periodMap = await loadPeriodMap(adminPb, periodIds);

  const out: StaffPayslipDto[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const periodId = String(r.period ?? "");
    const period = periodMap.get(periodId);
    if (!period) continue;
    const status = String(period.status ?? "").toLowerCase();
    if (!FINAL_STATUSES.has(status)) continue;
    out.push(mapItemRow(r, period));
  }
  return out;
}

async function getPayrollItemRaw(adminPb: PocketBase, itemId: string): Promise<Record<string, unknown>> {
  try {
    return (await adminPb.collection("payroll_items").getOne(itemId, { requestKey: null })) as Record<
      string,
      unknown
    >;
  } catch {
    throw new HrApiError("Slip gaji tidak ditemukan.", 404);
  }
}

export async function assertPayslipAccess(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  itemId: string,
  requireDownload = false,
): Promise<{ item: Record<string, unknown>; period: Record<string, unknown> }> {
  const item = await getPayrollItemRaw(adminPb, itemId);
  const targetUserId = String(item.user ?? "");
  const periodId = String(item.period ?? "");

  let period: Record<string, unknown>;
  try {
    period = (await adminPb.collection("payroll_periods").getOne(periodId, { requestKey: null })) as Record<
      string,
      unknown
    >;
  } catch {
    throw new HrApiError("Periode payroll tidak ditemukan.", 404);
  }

  const periodStatus = String(period.status ?? "").toLowerCase();
  if (!FINAL_STATUSES.has(periodStatus)) {
    throw new HrApiError("Slip belum tersedia — periode belum disetujui/dibayar.", 403);
  }

  const isSelf = targetUserId === ctx.userId;
  if (isSelf) {
    const cap = requireDownload ? "payslip.download_self" : "payslip.view_self";
    if (!hasPayslipCapability(ctx.user, cap)) {
      throw new HrApiError("Akses slip gaji ditolak.", 403);
    }
  } else {
    const cap = requireDownload ? "payslip.download_scoped" : "payslip.view_scoped";
    if (!hasPayslipCapability(ctx.user, cap)) {
      throw new HrApiError("Akses slip gaji ditolak.", 403);
    }
    const companyId = String(item.company_id ?? "");
    if (ctx.isOwner) {
      // owner all entities
    } else if (!companyId || !isCompanyInScope(companyId, ctx.companyIds)) {
      throw new HrApiError("Slip di luar scope entitas Anda.", 403);
    }
  }

  if (!String(item.company_name_snapshot ?? "").trim() && FINAL_STATUSES.has(periodStatus)) {
    await stampPayrollItemEntitySnapshot(adminPb, itemId, targetUserId);
    await stampPayrollItemBankSnapshot(adminPb, itemId, targetUserId);
    const refreshed = await getPayrollItemRaw(adminPb, itemId);
    return { item: refreshed, period };
  }

  if (!String(item.bank_name_snapshot ?? "").trim() && FINAL_STATUSES.has(periodStatus)) {
    await stampPayrollItemBankSnapshot(adminPb, itemId, targetUserId);
    const refreshed = await getPayrollItemRaw(adminPb, itemId);
    return { item: refreshed, period };
  }

  if (
    !String(item.company_logo_snapshot ?? "").trim() &&
    String(item.company_id ?? "").trim() &&
    FINAL_STATUSES.has(periodStatus)
  ) {
    await stampPayrollItemEntitySnapshot(adminPb, itemId, targetUserId);
    const refreshed = await getPayrollItemRaw(adminPb, itemId);
    return { item: refreshed, period };
  }

  return { item, period };
}

export async function getSelfPayslipById(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  itemId: string,
  req: Request,
): Promise<StaffPayslipDto> {
  const { item, period } = await assertPayslipAccess(adminPb, ctx, itemId, false);
  await assertAccountVerified(adminPb, ctx, req, String(item.user ?? ""));
  return mapItemRow(item, period);
}

export async function buildPayslipHtmlForActor(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  itemId: string,
  auditAction: "view" | "download",
  req: Request,
): Promise<string> {
  const { item, period } = await assertPayslipAccess(
    adminPb,
    ctx,
    itemId,
    auditAction === "download",
  );
  await assertAccountVerified(adminPb, ctx, req, String(item.user ?? ""));
  const dto = mapItemRow(item, period);
  const companyId = String(item.company_id ?? "").trim();
  const logoFile = await resolveEntityLogoFilenameForPayslip(
    adminPb,
    companyId,
    String(item.company_logo_snapshot ?? ""),
  );
  if (companyId && logoFile) {
    dto.company_logo_data_url = (await fetchEntityLogoDataUrl(adminPb, companyId, logoFile)) || undefined;
  }
  const event =
    auditAction === "download" ? PAYSLIP_AUDIT_EVENTS.DOWNLOADED : PAYSLIP_AUDIT_EVENTS.VIEWED;
  await emitPayslipAuditEvent(adminPb, {
    event_code: event,
    actor_id: ctx.userId,
    payroll_item_id: itemId,
    target_user_id: String(item.user ?? ""),
    period_key: dto.period_key,
    company_id: String(item.company_id ?? "") || undefined,
  });
  return buildPayrollSlipHtml(dto);
}

export async function stampAllPayrollItemsInPeriod(
  adminPb: PocketBase,
  periodId: string,
  force = false,
): Promise<number> {
  const { stampAllPayrollItemsInPeriod: stampEntity } = await import("@/lib/hr/payroll-entity-snapshot");
  const { stampAllPayrollItemBankSnapshotsInPeriod } = await import("@/lib/hr/payroll-bank-snapshot");
  const entityCount = await stampEntity(adminPb, periodId, force);
  await stampAllPayrollItemBankSnapshotsInPeriod(adminPb, periodId, force);
  return entityCount;
}
