/**
 * Phase 34E — Server-authoritative private employee documents.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { isCompanyInScope } from "@/lib/hr/company-scope";
import { hasEmployeeDocumentCapability } from "@/lib/capabilities/employee-document";
import { fetchPrimaryAdministrativeEntityForUser } from "@/lib/hr/profile-primary-entity";
import {
  validateEmployeeDocumentBytes,
  type EmployeeDocumentAllowedMime,
} from "@/lib/hr/document-validate";
import {
  emitEmployeeDocumentAuditEvent,
  EMPLOYEE_DOCUMENT_AUDIT_EVENTS,
} from "@/lib/hr/employee-document-audit";
import { assertAccountVerified } from "@/lib/hr/account-verification-server";

export const HR_EMPLOYEE_DOCUMENTS = "hr_employee_documents";

export const EMPLOYEE_DOCUMENT_TYPES = ["ktp", "npwp", "kk", "bank_account", "other"] as const;
export type EmployeeDocumentType = (typeof EMPLOYEE_DOCUMENT_TYPES)[number];

/** Configurable policy — optional types; ktp/npwp surfaced first in UI. */
export const EMPLOYEE_DOCUMENT_OPTIONAL_TYPES: EmployeeDocumentType[] = ["kk", "bank_account", "other"];

export type EmployeeDocumentDto = {
  id: string;
  document_type: EmployeeDocumentType;
  original_name: string;
  mime_type: string;
  is_current: boolean;
  uploaded_at: string;
  replaced_document_id?: string;
  verification_status: string;
};

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function mapDocRow(r: Record<string, unknown>): EmployeeDocumentDto {
  return {
    id: String(r.id),
    document_type: String(r.document_type ?? "other") as EmployeeDocumentType,
    original_name: String(r.original_name ?? r.file ?? "dokumen"),
    mime_type: String(r.mime_type ?? "application/octet-stream"),
    is_current: r.is_current !== false,
    uploaded_at: String(r.created ?? r.uploaded_at ?? ""),
    replaced_document_id: String(r.replaced_document_id ?? "").trim() || undefined,
    verification_status: String(r.verification_status ?? "pending"),
  };
}

async function resolveTargetUserCompanyId(adminPb: PocketBase, userId: string): Promise<string | null> {
  const primary = await fetchPrimaryAdministrativeEntityForUser(adminPb, userId);
  return primary.company_id ?? null;
}

export async function assertEmployeeDocumentAccess(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
  requireDownload = false,
): Promise<void> {
  const isSelf = targetUserId === ctx.userId;
  if (isSelf) {
    const cap = requireDownload ? "employee_document.download_self" : "employee_document.view_self";
    if (!hasEmployeeDocumentCapability(ctx.user, cap)) {
      throw new HrApiError("Akses dokumen ditolak.", 403);
    }
    return;
  }

  const cap = requireDownload ? "employee_document.download_scoped" : "employee_document.view_scoped";
  if (!hasEmployeeDocumentCapability(ctx.user, cap)) {
    throw new HrApiError("Akses dokumen ditolak.", 403);
  }

  if (ctx.isOwner) return;

  const companyId = await resolveTargetUserCompanyId(adminPb, targetUserId);
  if (!companyId || !isCompanyInScope(companyId, ctx.companyIds)) {
    throw new HrApiError("Dokumen di luar scope entitas Anda.", 403);
  }
}

export async function listEmployeeDocuments(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId?: string,
): Promise<EmployeeDocumentDto[]> {
  const uid = (targetUserId?.trim() || ctx.userId).trim();
  await assertEmployeeDocumentAccess(adminPb, ctx, uid, false);

  const rows = await adminPb.collection(HR_EMPLOYEE_DOCUMENTS).getFullList({
    filter: `user = "${pbEscape(uid)}" && is_current = true`,
    sort: "document_type,created",
    requestKey: null,
  });

  return rows.map((r) => mapDocRow(r as Record<string, unknown>));
}

async function getDocumentRecord(
  adminPb: PocketBase,
  docId: string,
): Promise<Record<string, unknown>> {
  try {
    return (await adminPb.collection(HR_EMPLOYEE_DOCUMENTS).getOne(docId, { requestKey: null })) as Record<
      string,
      unknown
    >;
  } catch {
    throw new HrApiError("Dokumen tidak ditemukan.", 404);
  }
}

export async function assertDocumentRecordAccess(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  docId: string,
  requireDownload = false,
): Promise<Record<string, unknown>> {
  const record = await getDocumentRecord(adminPb, docId);
  const targetUserId = String(record.user ?? "");
  await assertEmployeeDocumentAccess(adminPb, ctx, targetUserId, requireDownload);
  return record;
}

export async function uploadSelfEmployeeDocument(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  documentType: string,
  file: { bytes: Uint8Array; declaredMime: string; originalName: string },
): Promise<EmployeeDocumentDto> {
  if (!hasEmployeeDocumentCapability(ctx.user, "employee_document.upload_self")) {
    throw new HrApiError("Akses upload dokumen ditolak.", 403);
  }

  const type = documentType.trim().toLowerCase() as EmployeeDocumentType;
  if (!EMPLOYEE_DOCUMENT_TYPES.includes(type)) {
    throw new HrApiError("Jenis dokumen tidak valid.", 400);
  }

  const validated = validateEmployeeDocumentBytes(file.bytes, file.declaredMime, file.originalName);
  if (!validated.ok) throw new HrApiError(validated.error, 400);

  const existing = await adminPb.collection(HR_EMPLOYEE_DOCUMENTS).getFullList({
    filter: `user = "${pbEscape(ctx.userId)}" && document_type = "${pbEscape(type)}" && is_current = true`,
    fields: "id",
    requestKey: null,
  });

  let replacedId: string | undefined;
  for (const prev of existing) {
    replacedId = String(prev.id);
    await adminPb.collection(HR_EMPLOYEE_DOCUMENTS).update(
      replacedId,
      { is_current: false, replaced_at: new Date().toISOString() },
      { requestKey: null },
    );
  }

  const blob = new Blob([Buffer.from(file.bytes)], { type: validated.mime });
  const ext = extForMime(validated.mime);
  const safeName = sanitizeFilename(file.originalName, ext);

  const fd = new FormData();
  fd.append("user", ctx.userId);
  fd.append("document_type", type);
  fd.append("original_name", safeName);
  fd.append("mime_type", validated.mime);
  fd.append("is_current", "true");
  fd.append("verification_status", "pending");
  if (replacedId) fd.append("replaced_document_id", replacedId);
  fd.append("file", blob, safeName);

  const created = (await adminPb.collection(HR_EMPLOYEE_DOCUMENTS).create(fd, {
    requestKey: null,
  })) as Record<string, unknown>;

  const event = replacedId
    ? EMPLOYEE_DOCUMENT_AUDIT_EVENTS.REPLACED
    : EMPLOYEE_DOCUMENT_AUDIT_EVENTS.UPLOADED;

  await emitEmployeeDocumentAuditEvent(adminPb, {
    event_code: event,
    actor_id: ctx.userId,
    document_id: String(created.id),
    target_user_id: ctx.userId,
    document_type: type,
  });

  return mapDocRow(created);
}

function extForMime(mime: EmployeeDocumentAllowedMime): string {
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/png") return ".png";
  return ".jpg";
}

function sanitizeFilename(name: string, fallbackExt: string): string {
  const base = String(name || "dokumen")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim()
    .slice(0, 120);
  if (!base) return `dokumen${fallbackExt}`;
  if (base.includes(".")) return base;
  return `${base}${fallbackExt}`;
}

export async function readEmployeeDocumentBytes(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  docId: string,
  auditAction: "view" | "download",
  req: Request,
): Promise<{ bytes: Uint8Array; mime: string; filename: string }> {
  const record = await assertDocumentRecordAccess(adminPb, ctx, docId, auditAction === "download");
  const targetUserId = String(record.user ?? "");
  await assertAccountVerified(adminPb, ctx, req, targetUserId);
  const filename = String(record.file ?? "");
  if (!filename) throw new HrApiError("File tidak ada.", 404);

  const url = adminPb.files.getURL(record as never, filename);
  const token = adminPb.authStore.token;
  const res = await fetch(url, { headers: token ? { Authorization: token } : undefined });
  if (!res.ok) throw new HrApiError("File tidak dapat dibuka.", 404);

  const buf = new Uint8Array(await res.arrayBuffer());
  const mime = String(record.mime_type ?? "application/octet-stream");
  const displayName = String(record.original_name ?? filename);

  const event =
    auditAction === "download"
      ? EMPLOYEE_DOCUMENT_AUDIT_EVENTS.DOWNLOADED
      : EMPLOYEE_DOCUMENT_AUDIT_EVENTS.VIEWED;

  await emitEmployeeDocumentAuditEvent(adminPb, {
    event_code: event,
    actor_id: ctx.userId,
    document_id: docId,
    target_user_id: String(record.user ?? ""),
    document_type: String(record.document_type ?? "other"),
  });

  return { bytes: buf, mime, filename: displayName };
}
