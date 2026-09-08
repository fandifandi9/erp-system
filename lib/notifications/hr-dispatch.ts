/**
 * Phase 34E — HR policy & holiday notifications (reuses Phase 24 dispatch).
 */

import type PocketBase from "pocketbase";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { resolveStaffRecipientsForCompany } from "@/lib/notifications/hr-recipients";

export async function notifyHrPolicyPublished(
  adminPb: PocketBase,
  opts: { policyId: string; companyId?: string; title: string },
): Promise<void> {
  const recipientIds = await resolveStaffRecipientsForCompany(adminPb, opts.companyId);
  await dispatchNotification(adminPb, {
    recipientIds,
    type: "hr.policy.published",
    title: "Kebijakan HR Baru",
    body: `Kebijakan "${opts.title}" telah dipublikasikan. Buka Panduan Kepegawaian untuk detail.`,
    resource_type: "hr_policies",
    resource_id: opts.policyId,
    action: "/dashboard-staff/policies",
    idempotencyKeySuffix: `pub:${opts.policyId}`,
  });
}

export async function notifyHrPolicyUpdated(
  adminPb: PocketBase,
  opts: { policyId: string; companyId?: string; title: string },
): Promise<void> {
  const recipientIds = await resolveStaffRecipientsForCompany(adminPb, opts.companyId);
  await dispatchNotification(adminPb, {
    recipientIds,
    type: "hr.policy.updated",
    title: "Kebijakan HR Diperbarui",
    body: `Kebijakan "${opts.title}" telah diperbarui. Buka Panduan Kepegawaian untuk detail.`,
    resource_type: "hr_policies",
    resource_id: opts.policyId,
    action: "/dashboard-staff/policies",
    idempotencyKeySuffix: `upd:${opts.policyId}:${Date.now()}`,
  });
}

export async function notifyHolidayCreated(
  adminPb: PocketBase,
  opts: { holidayId: string; companyId?: string; date: string; name: string },
): Promise<void> {
  const recipientIds = await resolveStaffRecipientsForCompany(adminPb, opts.companyId);
  const formatted = formatDateId(opts.date);
  await dispatchNotification(adminPb, {
    recipientIds,
    type: "hr.holiday.created",
    title: "Hari Libur Baru",
    body: `${formatted} — ${opts.name}`,
    resource_type: "office_holidays",
    resource_id: opts.holidayId,
    action: "/dashboard-staff/holidays",
    idempotencyKeySuffix: opts.holidayId,
  });
}

export async function notifyHolidayUpdated(
  adminPb: PocketBase,
  opts: { holidayId: string; companyId?: string; date: string; name: string },
): Promise<void> {
  const recipientIds = await resolveStaffRecipientsForCompany(adminPb, opts.companyId);
  const formatted = formatDateId(opts.date);
  await dispatchNotification(adminPb, {
    recipientIds,
    type: "hr.holiday.updated",
    title: "Hari Libur Diperbarui",
    body: `${formatted} — ${opts.name}`,
    resource_type: "office_holidays",
    resource_id: opts.holidayId,
    action: "/dashboard-staff/holidays",
    idempotencyKeySuffix: `upd:${opts.holidayId}:${Date.now()}`,
  });
}

export async function notifyAttendancePolicyPublished(
  adminPb: PocketBase,
  opts: { policyId: string; companyId?: string; effectiveFrom: string },
): Promise<void> {
  const recipientIds = await resolveStaffRecipientsForCompany(adminPb, opts.companyId);
  const formatted = formatDateId(opts.effectiveFrom);
  await dispatchNotification(adminPb, {
    recipientIds,
    type: "hr.attendance_policy.published",
    title: "Kebijakan Absensi Diperbarui",
    body: `Kebijakan potongan keterlambatan/ketidakhadiran berlaku sejak ${formatted}.`,
    resource_type: "hr_entity_attendance_policies",
    resource_id: opts.policyId,
    action: "/dashboard-staff/policies",
    idempotencyKeySuffix: `att:${opts.policyId}`,
  });
}

export async function notifyPayslipAvailable(
  adminPb: PocketBase,
  opts: { userId: string; payrollItemId: string; periodKey: string },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: [opts.userId],
    type: "payslip.available",
    title: "Slip Gaji Tersedia",
    body: `Slip gaji periode ${opts.periodKey} sudah dapat diakses.`,
    resource_type: "payroll_items",
    resource_id: opts.payrollItemId,
    action: "/dashboard-staff/payroll",
    idempotencyKeySuffix: opts.payrollItemId,
  });
}

export async function notifyDocumentVerified(
  adminPb: PocketBase,
  opts: { userId: string; documentId: string; documentType: string },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: [opts.userId],
    type: "employee_document.verified",
    title: "Dokumen Diverifikasi",
    body: `Dokumen ${opts.documentType.toUpperCase()} Anda telah diverifikasi HR.`,
    resource_type: "hr_employee_documents",
    resource_id: opts.documentId,
    action: "/profile",
    idempotencyKeySuffix: `verified:${opts.documentId}`,
  });
}

export async function notifyDocumentRejected(
  adminPb: PocketBase,
  opts: { userId: string; documentId: string; documentType: string },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: [opts.userId],
    type: "employee_document.rejected",
    title: "Dokumen Perlu Diperbaiki",
    body: `Dokumen ${opts.documentType.toUpperCase()} perlu diunggah ulang. Buka Profil → Dokumen Pribadi.`,
    resource_type: "hr_employee_documents",
    resource_id: opts.documentId,
    action: "/profile",
    idempotencyKeySuffix: `rejected:${opts.documentId}`,
  });
}

function formatDateId(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
