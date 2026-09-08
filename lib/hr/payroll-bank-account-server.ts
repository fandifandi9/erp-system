/**
 * Phase 34F refinement — payroll bank account workflow (server-authoritative).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { isCompanyInScope } from "@/lib/hr/company-scope";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import {
  PAYROLL_BANK_COLLECTION,
  type HrPayrollBankRequestView,
  type PayrollBankAccountRecord,
  type SelfPayrollBankView,
} from "@/lib/hr/payroll-bank-account-types";
import {
  maskBankAccountNumber,
  normalizeBankAccountNumber,
  validateBankAccountInput,
} from "@/lib/hr/payroll-bank-account-utils";
import {
  dayBeforeYmd,
  isYmdInEffectiveRange,
  todayYmd,
  validateEffectiveFromYmd,
} from "@/lib/hr/payroll-bank-dates";
import { assertPayrollBankApprover } from "@/lib/hr/payroll-bank-auth";
import { resolveCapabilityHolders } from "@/lib/notifications/recipients";
import { notifyUserInApp } from "@/lib/tenant/notify-user";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function assertHrCanAccessUser(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
): Promise<void> {
  if (ctx.isOwner) return;
  if (!ctx.isHr) throw new HrApiError("Akses HR ditolak.", 403);
  const targetCompanies = await getAccessibleCompanyIds(adminPb, targetUserId);
  if (!targetCompanies.some((id) => isCompanyInScope(id, ctx.companyIds))) {
    throw new HrApiError("Akses ditolak untuk karyawan ini.", 403);
  }
}

function asUserId(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "id" in raw) return String((raw as { id: string }).id);
  return "";
}

function resolveEffectiveFrom(rec: Record<string, unknown>): string | undefined {
  const from = String(rec.effective_from ?? "").trim();
  if (from) return from.slice(0, 10);
  const legacy = String(rec.effective_at ?? "").trim();
  return legacy ? legacy.slice(0, 10) : undefined;
}

function mapRecord(rec: Record<string, unknown>): PayrollBankAccountRecord {
  return {
    id: String(rec.id ?? ""),
    user: asUserId(rec.user),
    bank_name: String(rec.bank_name ?? "").trim(),
    account_number: String(rec.account_number ?? "").trim(),
    account_holder_name: String(rec.account_holder_name ?? "").trim(),
    status: String(rec.status ?? "pending") as PayrollBankAccountRecord["status"],
    note: String(rec.note ?? "").trim() || undefined,
    evidence_document_id: String(rec.evidence_document_id ?? "").trim() || undefined,
    effective_at: String(rec.effective_at ?? "").trim() || undefined,
    effective_from: resolveEffectiveFrom(rec),
    effective_until: String(rec.effective_until ?? "").trim().slice(0, 10) || undefined,
    created_by: asUserId(rec.created_by) || undefined,
    approved_by: asUserId(rec.approved_by) || undefined,
    approved_at: String(rec.approved_at ?? "").trim() || undefined,
    rejected_by: asUserId(rec.rejected_by) || undefined,
    rejected_at: String(rec.rejected_at ?? "").trim() || undefined,
    rejection_reason: String(rec.rejection_reason ?? "").trim() || undefined,
    created: String(rec.created ?? ""),
    updated: String(rec.updated ?? ""),
  };
}

function isPayableBankRecord(rec: PayrollBankAccountRecord): boolean {
  return rec.status === "active" || rec.status === "inactive";
}

export async function getPayrollBankAccountForUserAsOf(
  adminPb: PocketBase,
  userId: string,
  asOfYmd: string,
): Promise<PayrollBankAccountRecord | null> {
  const rows = await adminPb.collection(PAYROLL_BANK_COLLECTION).getFullList({
    filter: `user = "${pbEscape(userId)}" && (status = "active" || status = "inactive")`,
    sort: "-effective_from,-effective_at,-updated",
    requestKey: null,
  });
  for (const row of rows) {
    const rec = mapRecord(row as Record<string, unknown>);
    if (!isPayableBankRecord(rec)) continue;
    const from = rec.effective_from || rec.effective_at;
    if (isYmdInEffectiveRange(asOfYmd, from, rec.effective_until)) {
      return rec;
    }
  }
  return null;
}

export async function getActivePayrollBankAccountForUser(
  adminPb: PocketBase,
  userId: string,
): Promise<PayrollBankAccountRecord | null> {
  const today = todayYmd();
  const asOf = await getPayrollBankAccountForUserAsOf(adminPb, userId, today);
  if (asOf) return asOf;
  const rows = await adminPb.collection(PAYROLL_BANK_COLLECTION).getFullList({
    filter: `user = "${pbEscape(userId)}" && status = "active"`,
    sort: "-effective_from,-effective_at,-updated",
    requestKey: null,
  });
  const rec = rows[0] as Record<string, unknown> | undefined;
  return rec ? mapRecord(rec) : null;
}

async function getPendingPayrollBankRequestForUser(
  adminPb: PocketBase,
  userId: string,
): Promise<PayrollBankAccountRecord | null> {
  const rows = await adminPb.collection(PAYROLL_BANK_COLLECTION).getFullList({
    filter: `user = "${pbEscape(userId)}" && status = "pending"`,
    sort: "-created",
    requestKey: null,
  });
  const rec = rows[0] as Record<string, unknown> | undefined;
  return rec ? mapRecord(rec) : null;
}

async function getLatestRejectedPayrollBankForUser(
  adminPb: PocketBase,
  userId: string,
): Promise<PayrollBankAccountRecord | null> {
  const rows = await adminPb.collection(PAYROLL_BANK_COLLECTION).getFullList({
    filter: `user = "${pbEscape(userId)}" && status = "rejected"`,
    sort: "-rejected_at,-created",
    requestKey: null,
  });
  const rec = rows[0] as Record<string, unknown> | undefined;
  return rec ? mapRecord(rec) : null;
}

function shouldShowLastRejected(
  active: PayrollBankAccountRecord | null,
  pending: PayrollBankAccountRecord | null,
  rejected: PayrollBankAccountRecord | null,
): boolean {
  if (!rejected || pending) return false;
  const rejectedAt = String(rejected.rejected_at ?? rejected.created ?? "");
  const activeAt = String(active?.approved_at ?? active?.created ?? "");
  return !activeAt || rejectedAt > activeAt;
}

export function toSelfPayrollBankView(
  active: PayrollBankAccountRecord | null,
  pending: PayrollBankAccountRecord | null,
  rejected: PayrollBankAccountRecord | null = null,
): SelfPayrollBankView {
  const showRejected = shouldShowLastRejected(active, pending, rejected);
  return {
    active: active
      ? {
          id: active.id,
          bank_name: active.bank_name,
          account_number_masked: maskBankAccountNumber(active.account_number),
          account_holder_name: active.account_holder_name,
          status: "active",
          effective_from: active.effective_from || active.effective_at,
          effective_until: active.effective_until,
        }
      : null,
    pending: pending
      ? {
          id: pending.id,
          bank_name: pending.bank_name,
          account_number_masked: maskBankAccountNumber(pending.account_number),
          account_holder_name: pending.account_holder_name,
          status: "pending",
          note: pending.note,
          created: pending.created,
        }
      : null,
    last_rejected: showRejected && rejected
      ? {
          bank_name: rejected.bank_name,
          account_number_masked: maskBankAccountNumber(rejected.account_number),
          account_holder_name: rejected.account_holder_name,
          rejection_reason: rejected.rejection_reason || "Ditolak oleh HR",
          rejected_at: rejected.rejected_at || rejected.created,
        }
      : null,
  };
}

export async function getSelfPayrollBankView(
  adminPb: PocketBase,
  userId: string,
): Promise<SelfPayrollBankView> {
  const [active, pending, rejected] = await Promise.all([
    getActivePayrollBankAccountForUser(adminPb, userId),
    getPendingPayrollBankRequestForUser(adminPb, userId),
    getLatestRejectedPayrollBankForUser(adminPb, userId),
  ]);
  return toSelfPayrollBankView(active, pending, rejected);
}

export async function submitPayrollBankChangeRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    bank_name: string;
    account_number: string;
    account_holder_name: string;
    note?: string;
    evidence_document_id?: string;
  },
): Promise<SelfPayrollBankView> {
  const validated = validateBankAccountInput(input);
  if (!validated.ok) throw new HrApiError(validated.error, 400);

  const existingPending = await getPendingPayrollBankRequestForUser(adminPb, ctx.userId);
  if (existingPending) {
    throw new HrApiError("Pengajuan perubahan rekening masih menunggu persetujuan HR.", 409);
  }

  const accountNumber = normalizeBankAccountNumber(input.account_number);
  const active = await getActivePayrollBankAccountForUser(adminPb, ctx.userId);
  if (
    active &&
    active.bank_name.toLowerCase() === input.bank_name.trim().toLowerCase() &&
    active.account_number === accountNumber &&
    active.account_holder_name.toLowerCase() === input.account_holder_name.trim().toLowerCase()
  ) {
    throw new HrApiError("Rekening yang diajukan sama dengan rekening aktif.", 400);
  }

  const created = await adminPb.collection(PAYROLL_BANK_COLLECTION).create(
    {
      user: ctx.userId,
      bank_name: input.bank_name.trim(),
      account_number: accountNumber,
      account_holder_name: input.account_holder_name.trim(),
      status: "pending",
      note: String(input.note ?? "").trim() || undefined,
      evidence_document_id: String(input.evidence_document_id ?? "").trim() || undefined,
      created_by: ctx.userId,
    },
    { requestKey: null },
  );

  const employee = await resolveEmployeeDisplay(adminPb, ctx.userId);
  await notifyPayrollBankChangeRequested(adminPb, {
    requesterUserId: ctx.userId,
    requestId: String(created.id),
    actorId: ctx.userId,
    employeeName: employee.name,
  });

  return getSelfPayrollBankView(adminPb, ctx.userId);
}

async function notifyPayrollBankChangeRequested(
  adminPb: PocketBase,
  input: {
    requesterUserId: string;
    requestId: string;
    actorId: string;
    employeeName: string;
  },
): Promise<void> {
  const companyIds = await getAccessibleCompanyIds(adminPb, input.requesterUserId);
  const approverIds = await resolveCapabilityHolders(adminPb, "payroll.bank.approve", {
    companyIds: companyIds.length > 0 ? companyIds : undefined,
  });
  const targets = approverIds.filter((id) => id !== input.requesterUserId);
  await Promise.all(
    targets.map((userId) =>
      notifyUserInApp(adminPb, {
        userId,
        event_code: "payroll_bank.change_requested",
        module: "hr",
        actor_id: input.actorId,
        entity_type: "user",
        entity_id: input.requesterUserId,
        entity_label: `Pengajuan rekening — ${input.employeeName}`,
        payload: {
          action_url: "/pengaturan/persetujuan-rekening",
          employee_name: input.employeeName,
        },
        dedupe_key: `payroll_bank.req:${input.requestId}:${userId}`,
      }),
    ),
  );
}

async function notifyPayrollBankDecision(
  adminPb: PocketBase,
  input: {
    userId: string;
    eventCode: "payroll_bank.change_approved" | "payroll_bank.change_rejected";
    actorId: string;
    requestId: string;
    entityLabel: string;
  },
): Promise<void> {
  await notifyUserInApp(adminPb, {
    userId: input.userId,
    event_code: input.eventCode,
    module: "hr",
    actor_id: input.actorId,
    entity_type: "user",
    entity_id: input.userId,
    entity_label: input.entityLabel,
    payload: { action_url: "/profile" },
    dedupe_key: `payroll_bank.${input.eventCode}:${input.requestId}`,
  });
}

async function resolveEmployeeDisplay(
  adminPb: PocketBase,
  userId: string,
): Promise<{ name: string; code?: string }> {
  try {
    const rows = await adminPb.collection("profiles").getFullList({
      filter: `user = "${pbEscape(userId)}"`,
      fields: "employee_code,nik,name,user",
      requestKey: null,
    });
    const p = rows[0] as Record<string, unknown> | undefined;
    if (!p) return { name: userId.slice(0, 8) };
    return {
      name: String(p.name ?? "").trim() || userId.slice(0, 8),
      code: String(p.employee_code ?? p.nik ?? "").trim() || undefined,
    };
  } catch {
    return { name: userId.slice(0, 8) };
  }
}

export async function listPendingPayrollBankRequestsForHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<HrPayrollBankRequestView[]> {
  if (!ctx.isOwner && !ctx.isHr) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }

  const pendingRows = await adminPb.collection(PAYROLL_BANK_COLLECTION).getFullList({
    filter: `status = "pending"`,
    sort: "-created",
    requestKey: null,
  });

  const out: HrPayrollBankRequestView[] = [];
  for (const row of pendingRows) {
    const rec = mapRecord(row as Record<string, unknown>);
    const userId = rec.user;

    if (!ctx.isOwner) {
      try {
        await assertHrCanAccessUser(adminPb, ctx, userId);
      } catch {
        continue;
      }
    }

    const active = await getActivePayrollBankAccountForUser(adminPb, userId);
    const employee = await resolveEmployeeDisplay(adminPb, userId);

    out.push({
      id: rec.id,
      user_id: userId,
      employee_name: employee.name,
      employee_code: employee.code,
      current: active
        ? {
            bank_name: active.bank_name,
            account_number_masked: maskBankAccountNumber(active.account_number),
            account_holder_name: active.account_holder_name,
            effective_from: active.effective_from || active.effective_at,
            effective_until: active.effective_until,
          }
        : null,
      proposed: {
        bank_name: rec.bank_name,
        account_number_masked: maskBankAccountNumber(rec.account_number),
        account_holder_name: rec.account_holder_name,
        note: rec.note,
      },
      status: "pending",
      created: rec.created,
    });
  }
  return out;
}

async function getPendingRequestById(
  adminPb: PocketBase,
  requestId: string,
): Promise<PayrollBankAccountRecord> {
  try {
    const rec = (await adminPb.collection(PAYROLL_BANK_COLLECTION).getOne(requestId, {
      requestKey: null,
    })) as Record<string, unknown>;
    const mapped = mapRecord(rec);
    if (mapped.status !== "pending") {
      throw new HrApiError("Pengajuan tidak dalam status menunggu.", 400);
    }
    return mapped;
  } catch (e) {
    if (e instanceof HrApiError) throw e;
    throw new HrApiError("Pengajuan rekening tidak ditemukan.", 404);
  }
}

export async function approvePayrollBankChangeRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
  options?: { effective_from?: string },
): Promise<void> {
  if (!ctx.isOwner && !ctx.isHr) throw new HrApiError("Akses HR ditolak.", 403);
  await assertPayrollBankApprover(adminPb, ctx);

  const pending = await getPendingRequestById(adminPb, requestId);
  if (pending.user === ctx.userId && !ctx.isOwner) {
    throw new HrApiError("Tidak dapat menyetujui pengajuan sendiri.", 403);
  }

  if (!ctx.isOwner) {
    await assertHrCanAccessUser(adminPb, ctx, pending.user);
  }

  const rawEffective = String(options?.effective_from ?? "").trim() || todayYmd();
  const validated = validateEffectiveFromYmd(rawEffective);
  if (!validated.ok) throw new HrApiError(validated.error, 400);
  const effectiveFromYmd = validated.ymd;

  const now = new Date().toISOString();
  const active = await getActivePayrollBankAccountForUser(adminPb, pending.user);
  if (active) {
    const until = dayBeforeYmd(effectiveFromYmd);
    await adminPb.collection(PAYROLL_BANK_COLLECTION).update(
      active.id,
      {
        status: "inactive",
        effective_until: until || undefined,
      },
      { requestKey: null },
    );
  }

  await adminPb.collection(PAYROLL_BANK_COLLECTION).update(
    pending.id,
    {
      status: "active",
      effective_from: effectiveFromYmd,
      effective_at: effectiveFromYmd,
      effective_until: "",
      approved_by: ctx.userId,
      approved_at: now,
      rejection_reason: "",
      rejected_by: "",
      rejected_at: "",
    },
    { requestKey: null },
  );

  await notifyPayrollBankDecision(adminPb, {
    userId: pending.user,
    eventCode: "payroll_bank.change_approved",
    actorId: ctx.userId,
    requestId: pending.id,
    entityLabel: "Perubahan rekening payroll disetujui",
  });
}

export async function rejectPayrollBankChangeRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
  reason?: string,
): Promise<void> {
  if (!ctx.isOwner && !ctx.isHr) throw new HrApiError("Akses HR ditolak.", 403);
  await assertPayrollBankApprover(adminPb, ctx);

  const rejectionReason = String(reason ?? "").trim();
  if (!rejectionReason) {
    throw new HrApiError("Alasan penolakan wajib diisi.", 400);
  }

  const pending = await getPendingRequestById(adminPb, requestId);
  if (pending.user === ctx.userId && !ctx.isOwner) {
    throw new HrApiError("Tidak dapat menolak pengajuan sendiri.", 403);
  }

  if (!ctx.isOwner) {
    await assertHrCanAccessUser(adminPb, ctx, pending.user);
  }

  const now = new Date().toISOString();
  await adminPb.collection(PAYROLL_BANK_COLLECTION).update(
    pending.id,
    {
      status: "rejected",
      rejected_by: ctx.userId,
      rejected_at: now,
      rejection_reason: rejectionReason,
    },
    { requestKey: null },
  );

  await notifyPayrollBankDecision(adminPb, {
    userId: pending.user,
    eventCode: "payroll_bank.change_rejected",
    actorId: ctx.userId,
    requestId: pending.id,
    entityLabel: "Perubahan rekening payroll ditolak",
  });
}

/** HR scoped read — masked account for a target user. */
export async function getPayrollBankViewForTargetUser(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
): Promise<SelfPayrollBankView> {
  if (targetUserId !== ctx.userId) {
    if (!ctx.isOwner && !ctx.isHr) throw new HrApiError("Akses ditolak.", 403);
    if (!ctx.isOwner) await assertHrCanAccessUser(adminPb, ctx, targetUserId);
  }
  return getSelfPayrollBankView(adminPb, targetUserId);
}

export function assertBankRequestIdMatchesUser(
  request: PayrollBankAccountRecord,
  claimedUserId: string,
): void {
  if (request.user !== claimedUserId) {
    throw new HrApiError("Akses ditolak.", 403);
  }
}

export { maskBankAccountNumber };
