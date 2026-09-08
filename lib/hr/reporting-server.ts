/**
 * Phase 13 — Staff reports & HR findings. All writes via admin PB after session auth.
 * Attachments are never public URLs; clients use Next.js auth-gated routes.
 */
import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { isHrOperationalActor } from "@/lib/access/hr-api-enforcement";
import { getHrWorkingCompanyIds } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  FINDING_CATEGORIES,
  REPORT_CATEGORIES,
  REPORTING_COLLECTIONS,
  REPORTING_MAX_ATTACHMENTS,
  type CaseKind,
  type CasePriority,
  type CaseStatus,
  type ReportingAttachmentMeta,
  type ReportingCase,
} from "@/lib/hr/reporting-types";
import { attachmentLimitMessage, validateEvidenceBytes } from "@/lib/hr/reporting-validate";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function asId(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "id" in raw) return String((raw as { id: string }).id ?? "");
  return "";
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(raw ?? "").trim();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function collectionFor(kind: CaseKind): string {
  return kind === "finding" ? REPORTING_COLLECTIONS.findings : REPORTING_COLLECTIONS.reports;
}

function publicPath(kind: CaseKind, parentId: string, attId: string): string {
  const base = kind === "finding" ? "findings" : "reports";
  return `/api/hr/${base}/${parentId}/attachments/${attId}`;
}

function mapCase(kind: CaseKind, rec: Record<string, unknown>): ReportingCase {
  return {
    id: String(rec.id ?? ""),
    kind,
    title: String(rec.title ?? ""),
    body: String(rec.body ?? ""),
    category: String(rec.category ?? ""),
    status: oneOf(rec.status, CASE_STATUSES, "draft"),
    priority: oneOf(rec.priority, CASE_PRIORITIES, "medium"),
    location_text: String(rec.location_text ?? ""),
    created_by: asId(rec.created_by),
    company_id: String(rec.company_id ?? ""),
    hr_note: String(rec.hr_note ?? ""),
    submitted_at: String(rec.submitted_at ?? ""),
    closed_at: String(rec.closed_at ?? ""),
    closed_by: asId(rec.closed_by),
    created: String(rec.created ?? ""),
    updated: String(rec.updated ?? ""),
  };
}

function mapAttachment(
  kind: CaseKind,
  parentId: string,
  rec: Record<string, unknown>,
): ReportingAttachmentMeta {
  return {
    id: String(rec.id ?? ""),
    kind,
    parent_id: parentId,
    original_name: String(rec.original_name ?? rec.file ?? "image"),
    mime: String(rec.mime ?? "image/jpeg"),
    size: Number(rec.size) || 0,
    created: String(rec.created ?? ""),
    created_by: asId(rec.created_by),
    url: publicPath(kind, parentId, String(rec.id ?? "")),
  };
}

function isHrReportingActor(ctx: HrApiAuthContext): boolean {
  return isHrOperationalActor(ctx);
}

async function reportingScopeCompanyIds(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<string[]> {
  if (ctx.isOwner) return ctx.companyIds;
  if (!isHrReportingActor(ctx)) return [];
  return getHrOperationalCompanyIds(adminPb, ctx);
}

async function companyInReportingScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  companyId: string,
): Promise<boolean> {
  if (!companyId) return false;
  if (ctx.isOwner) return true;
  const scope = await reportingScopeCompanyIds(adminPb, ctx);
  return scope.includes(companyId);
}

function assertCanWriteKind(ctx: HrApiAuthContext, kind: CaseKind): void {
  if (kind === "finding" && !ctx.isOwner && !isHrReportingActor(ctx)) {
    throw new HrApiError("Hanya HR atau Owner yang dapat membuat temuan.", 403);
  }
}

export async function canViewCase(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  rec: ReportingCase,
): Promise<boolean> {
  if (ctx.isOwner) return true;
  if (rec.created_by === ctx.userId) return true;
  if (isHrReportingActor(ctx)) {
    if (!rec.company_id) return rec.created_by === ctx.userId;
    return companyInReportingScope(adminPb, ctx, rec.company_id);
  }
  return false;
}

export async function assertCanViewCase(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  rec: ReportingCase,
): Promise<void> {
  if (rec.kind === "finding" && !ctx.isOwner && !isHrReportingActor(ctx)) {
    throw new HrApiError("Akses ditolak.", 403);
  }
  if (!(await canViewCase(adminPb, ctx, rec))) {
    throw new HrApiError("Akses ditolak.", 403);
  }
}

/** Stamp new cases with working/active company (employment context), not full Shared span. */
function stampCompanyId(ctx: HrApiAuthContext): string {
  const working = getHrWorkingCompanyIds(ctx);
  if (working[0]) return working[0];
  if (ctx.isOwner) return ctx.companyIds[0] || "";
  return "";
}

async function emit(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  event_code: string,
  entity_type: string,
  entity_id: string,
  entity_label?: string,
) {
  await emitBusinessEventServer(adminPb, {
    event_code,
    severity: "info",
    module: "hr",
    entity_type,
    entity_id,
    entity_label,
    actor_id: ctx.userId,
    payload: {},
    dedupe_key: `${event_code}:${entity_id}:${Date.now()}`,
  });
}

export async function serverGetCase(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  id: string,
): Promise<ReportingCase> {
  let rec: Record<string, unknown>;
  try {
    rec = (await adminPb.collection(collectionFor(kind)).getOne(id, { requestKey: null })) as Record<
      string,
      unknown
    >;
  } catch {
    throw new HrApiError("Data tidak ditemukan.", 404);
  }
  const mapped = mapCase(kind, rec);
  await assertCanViewCase(adminPb, ctx, mapped);
  return mapped;
}

export async function serverListCases(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  page = 1,
  perPage = 40,
): Promise<{ items: ReportingCase[]; totalItems: number }> {
  if (kind === "finding" && !ctx.isOwner && !isHrReportingActor(ctx)) {
    throw new HrApiError("Akses ditolak.", 403);
  }

  let filter = `created_by = "${pbEscape(ctx.userId)}"`;
  if (ctx.isOwner) {
    filter = "";
  } else if (isHrReportingActor(ctx)) {
    const companyIds = await reportingScopeCompanyIds(adminPb, ctx);
    if (companyIds.length) {
      const or = companyIds.map((id) => `company_id = "${pbEscape(id)}"`).join(" || ");
      filter = `(${or}) || created_by = "${pbEscape(ctx.userId)}"`;
    }
  }

  const res = await adminPb.collection(collectionFor(kind)).getList(page, perPage, {
    filter,
    sort: "-created",
    requestKey: null,
  });
  const mapped = res.items.map((r) => mapCase(kind, r as unknown as Record<string, unknown>));
  const items: ReportingCase[] = [];
  for (const row of mapped) {
    if (await canViewCase(adminPb, ctx, row)) items.push(row);
  }
  return { items, totalItems: res.totalItems };
}

export async function serverCreateCase(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  input: {
    title: string;
    body: string;
    category?: string;
    priority?: string;
    location_text?: string;
    submit?: boolean;
  },
): Promise<ReportingCase> {
  assertCanWriteKind(ctx, kind);
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  if (!title) throw new HrApiError("Judul wajib diisi.", 400);
  if (!body) throw new HrApiError("Isi wajib diisi.", 400);
  if (title.length > 180) throw new HrApiError("Judul terlalu panjang.", 400);
  if (body.length > 8000) throw new HrApiError("Isi terlalu panjang.", 400);

  const cats = kind === "finding" ? FINDING_CATEGORIES : REPORT_CATEGORIES;
  const category = oneOf(input.category, cats, kind === "finding" ? "safety" : "other");
  const priority = oneOf(input.priority, CASE_PRIORITIES, "medium");
  const submit = Boolean(input.submit);
  const now = new Date().toISOString();

  const rec = (await adminPb.collection(collectionFor(kind)).create({
    title,
    body,
    category,
    priority,
    location_text: String(input.location_text || "").trim().slice(0, 200),
    status: submit ? "submitted" : "draft",
    created_by: ctx.userId,
    company_id: stampCompanyId(ctx),
    submitted_at: submit ? now : "",
  })) as Record<string, unknown>;

  const mapped = mapCase(kind, rec);
  await emit(
    adminPb,
    ctx,
    submit ? `hr.${kind}.submitted` : `hr.${kind}.created`,
    kind === "finding" ? "hr_finding" : "hr_staff_report",
    mapped.id,
    mapped.title,
  );
  return mapped;
}

export async function serverUpdateDraft(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  id: string,
  input: {
    title?: string;
    body?: string;
    category?: string;
    priority?: string;
    location_text?: string;
    hr_note?: string;
  },
): Promise<ReportingCase> {
  const current = await serverGetCase(adminPb, ctx, kind, id);
  const isHrActor = ctx.isOwner || isHrReportingActor(ctx);
  if (current.status === "closed") throw new HrApiError("Data sudah ditutup.", 400);

  const patch: Record<string, unknown> = {};
  if (current.status === "draft" && current.created_by === ctx.userId) {
    if (input.title != null) {
      const title = String(input.title).trim();
      if (!title) throw new HrApiError("Judul wajib diisi.", 400);
      patch.title = title.slice(0, 180);
    }
    if (input.body != null) {
      const body = String(input.body).trim();
      if (!body) throw new HrApiError("Isi wajib diisi.", 400);
      patch.body = body.slice(0, 8000);
    }
    if (input.category != null) {
      const cats = kind === "finding" ? FINDING_CATEGORIES : REPORT_CATEGORIES;
      patch.category = oneOf(input.category, cats, current.category as never);
    }
    if (input.priority != null) patch.priority = oneOf(input.priority, CASE_PRIORITIES, current.priority);
    if (input.location_text != null) patch.location_text = String(input.location_text).trim().slice(0, 200);
  } else if (current.created_by === ctx.userId && current.status !== "draft") {
    throw new HrApiError("Laporan sudah dikirim dan tidak dapat diubah.", 400);
  } else if (!isHrActor) {
    throw new HrApiError("Akses ditolak.", 403);
  }

  if (isHrActor && input.hr_note != null) {
    patch.hr_note = String(input.hr_note).trim().slice(0, 4000);
  } else if (input.hr_note != null && !isHrActor) {
    throw new HrApiError("Field hr_note tidak boleh dikirim oleh klien.", 400);
  }

  if (!Object.keys(patch).length) return current;
  const rec = (await adminPb.collection(collectionFor(kind)).update(id, patch)) as Record<string, unknown>;
  return mapCase(kind, rec);
}

export async function serverSubmitCase(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  id: string,
): Promise<ReportingCase> {
  const current = await serverGetCase(adminPb, ctx, kind, id);
  if (current.created_by !== ctx.userId && !ctx.isOwner) {
    throw new HrApiError("Akses ditolak.", 403);
  }
  if (current.status !== "draft") {
    throw new HrApiError("Hanya draf yang dapat dikirim.", 400);
  }
  const rec = (await adminPb.collection(collectionFor(kind)).update(id, {
    status: "submitted",
    submitted_at: new Date().toISOString(),
  })) as Record<string, unknown>;
  const mapped = mapCase(kind, rec);
  await emit(
    adminPb,
    ctx,
    `hr.${kind}.submitted`,
    kind === "finding" ? "hr_finding" : "hr_staff_report",
    mapped.id,
    mapped.title,
  );
  return mapped;
}

export async function serverCloseCase(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  id: string,
  hr_note?: string,
): Promise<ReportingCase> {
  if (!ctx.isOwner && !isHrReportingActor(ctx)) throw new HrApiError("Akses HR ditolak.", 403);
  const current = await serverGetCase(adminPb, ctx, kind, id);
  if (current.status === "closed") return current;
  const rec = (await adminPb.collection(collectionFor(kind)).update(id, {
    status: "closed",
    closed_at: new Date().toISOString(),
    closed_by: ctx.userId,
    hr_note: hr_note != null ? String(hr_note).trim().slice(0, 4000) : current.hr_note,
  })) as Record<string, unknown>;
  return mapCase(kind, rec);
}

export async function serverListAttachments(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  parentId: string,
): Promise<ReportingAttachmentMeta[]> {
  await serverGetCase(adminPb, ctx, kind, parentId);
  const res = await adminPb.collection(REPORTING_COLLECTIONS.attachments).getFullList({
    filter: `kind = "${kind}" && parent_id = "${pbEscape(parentId)}"`,
    sort: "created",
    requestKey: null,
  });
  return res.map((r) => mapAttachment(kind, parentId, r as unknown as Record<string, unknown>));
}

export async function serverCountAttachments(
  adminPb: PocketBase,
  kind: CaseKind,
  parentId: string,
): Promise<number> {
  const res = await adminPb.collection(REPORTING_COLLECTIONS.attachments).getList(1, 1, {
    filter: `kind = "${kind}" && parent_id = "${pbEscape(parentId)}"`,
    requestKey: null,
  });
  return res.totalItems;
}

export async function serverAddAttachment(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  parentId: string,
  file: { bytes: Uint8Array; declaredMime: string; originalName: string },
): Promise<ReportingAttachmentMeta> {
  const parent = await serverGetCase(adminPb, ctx, kind, parentId);
  if (parent.created_by !== ctx.userId && !ctx.isOwner && !isHrReportingActor(ctx)) {
    throw new HrApiError("Akses ditolak.", 403);
  }
  if (parent.status !== "draft") {
    throw new HrApiError("Bukti hanya dapat diubah sebelum dikirim.", 400);
  }
  const count = await serverCountAttachments(adminPb, kind, parentId);
  if (count >= REPORTING_MAX_ATTACHMENTS) {
    throw new HrApiError(attachmentLimitMessage(count, REPORTING_MAX_ATTACHMENTS), 400);
  }
  const checked = validateEvidenceBytes(file.bytes, file.declaredMime);
  if (!checked.ok) throw new HrApiError(checked.error, 400);

  const name = String(file.originalName || "evidence").replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const payload = new Uint8Array(file.bytes.byteLength);
  payload.set(file.bytes);
  const blob = new Blob([payload as BlobPart], { type: checked.mime });
  const rec = (await adminPb.collection(REPORTING_COLLECTIONS.attachments).create({
    kind,
    parent_id: parentId,
    created_by: ctx.userId,
    original_name: name || "evidence",
    mime: checked.mime,
    size: file.bytes.byteLength,
    file: new File([blob], name || `evidence.${checked.mime.split("/")[1] === "jpeg" ? "jpg" : checked.mime.split("/")[1]}`, {
      type: checked.mime,
    }),
  })) as Record<string, unknown>;
  return mapAttachment(kind, parentId, rec);
}

export async function serverGetAttachmentRecord(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  parentId: string,
  attId: string,
): Promise<{ meta: ReportingAttachmentMeta; record: Record<string, unknown> }> {
  await serverGetCase(adminPb, ctx, kind, parentId);
  let rec: Record<string, unknown>;
  try {
    rec = (await adminPb.collection(REPORTING_COLLECTIONS.attachments).getOne(attId, {
      requestKey: null,
    })) as Record<string, unknown>;
  } catch {
    throw new HrApiError("Bukti tidak ditemukan.", 404);
  }
  if (String(rec.kind) !== kind || String(rec.parent_id) !== parentId) {
    throw new HrApiError("Akses ditolak.", 403);
  }
  return { meta: mapAttachment(kind, parentId, rec), record: rec };
}

export async function serverDeleteAttachment(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  parentId: string,
  attId: string,
): Promise<void> {
  const parent = await serverGetCase(adminPb, ctx, kind, parentId);
  if (parent.status !== "draft") {
    throw new HrApiError("Bukti hanya dapat dihapus sebelum dikirim.", 400);
  }
  if (parent.created_by !== ctx.userId && !ctx.isOwner && !isHrReportingActor(ctx)) {
    throw new HrApiError("Akses ditolak.", 403);
  }
  const { record } = await serverGetAttachmentRecord(adminPb, ctx, kind, parentId, attId);
  await adminPb.collection(REPORTING_COLLECTIONS.attachments).delete(String(record.id));
}

export async function serverReadAttachmentBytes(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  kind: CaseKind,
  parentId: string,
  attId: string,
): Promise<{ bytes: Uint8Array; mime: string; filename: string }> {
  const { meta, record } = await serverGetAttachmentRecord(adminPb, ctx, kind, parentId, attId);
  const filename = String(record.file || "");
  if (!filename) throw new HrApiError("File tidak ada.", 404);
  const url = adminPb.files.getURL(record as never, filename);
  const token = adminPb.authStore.token;
  const res = await fetch(url, {
    headers: token ? { Authorization: token } : undefined,
  });
  if (!res.ok) throw new HrApiError("File tidak dapat dibuka.", 404);
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, mime: meta.mime || "image/jpeg", filename: meta.original_name || filename };
}

export function sanitizeCaseForClient(ctx: HrApiAuthContext, rec: ReportingCase): ReportingCase {
  if (ctx.isOwner || isHrReportingActor(ctx)) return rec;
  return { ...rec, hr_note: "" };
}
