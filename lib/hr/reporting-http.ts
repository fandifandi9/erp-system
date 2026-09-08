import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import type { CaseKind } from "@/lib/hr/reporting-types";
import { notifyReportCreated } from "@/lib/notifications/dispatch";
import { resolveReportReviewers } from "@/lib/notifications/recipients";
import { REPORTING_MAX_ATTACHMENTS } from "@/lib/hr/reporting-types";
import {
  sanitizeCaseForClient,
  serverAddAttachment,
  serverCloseCase,
  serverCreateCase,
  serverDeleteAttachment,
  serverGetCase,
  serverListAttachments,
  serverListCases,
  serverReadAttachmentBytes,
  serverSubmitCase,
  serverUpdateDraft,
} from "@/lib/hr/reporting-server";

function jsonBody(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export async function reportingList(req: Request, kind: CaseKind) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") || 1) || 1;
    const perPage = Math.min(Number(url.searchParams.get("perPage") || 40) || 40, 100);
    const adminPb = await getInventoryAdminPb();
    const res = await serverListCases(adminPb, ctx, kind, page, perPage);
    return NextResponse.json({
      ok: true,
      items: res.items.map((r) => sanitizeCaseForClient(ctx, r)),
      totalItems: res.totalItems,
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingCreate(req: Request, kind: CaseKind) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    let body: Record<string, unknown> = {};
    try {
      body = jsonBody(await req.json());
    } catch {
      body = {};
    }
    rejectClientPrivilegeFields(body);
    if (body.created_by != null || body.user != null || body.user_id != null || body.status != null) {
      throw new HrApiError("Field identity/status tidak boleh dikirim oleh klien.", 400);
    }
    const adminPb = await getInventoryAdminPb();
    const rec = await serverCreateCase(adminPb, ctx, kind, {
      title: String(body.title ?? ""),
      body: String(body.body ?? ""),
      category: body.category != null ? String(body.category) : undefined,
      priority: body.priority != null ? String(body.priority) : undefined,
      location_text: body.location_text != null ? String(body.location_text) : undefined,
      submit: Boolean(body.submit),
    });
    return NextResponse.json({ ok: true, data: sanitizeCaseForClient(ctx, rec), id: rec.id });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingGet(_req: Request, kind: CaseKind, id: string) {
  try {
    const ctx = await getAuthenticatedHrUser(_req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    const rec = await serverGetCase(adminPb, ctx, kind, id);
    const attachments = await serverListAttachments(adminPb, ctx, kind, id);
    return NextResponse.json({
      ok: true,
      data: sanitizeCaseForClient(ctx, rec),
      attachments,
      evidenceCount: attachments.length,
      evidenceMax: REPORTING_MAX_ATTACHMENTS,
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingPatch(req: Request, kind: CaseKind, id: string) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    let body: Record<string, unknown> = {};
    try {
      body = jsonBody(await req.json());
    } catch {
      body = {};
    }
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const rec = await serverUpdateDraft(adminPb, ctx, kind, id, {
      title: body.title != null ? String(body.title) : undefined,
      body: body.body != null ? String(body.body) : undefined,
      category: body.category != null ? String(body.category) : undefined,
      priority: body.priority != null ? String(body.priority) : undefined,
      location_text: body.location_text != null ? String(body.location_text) : undefined,
      hr_note: body.hr_note != null ? String(body.hr_note) : undefined,
    });
    return NextResponse.json({ ok: true, data: sanitizeCaseForClient(ctx, rec) });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingSubmit(req: Request, kind: CaseKind, id: string) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    const rec = await serverSubmitCase(adminPb, ctx, kind, id);

    // Fire-and-forget: notify HR reviewers on report submission (not findings — those are HR-created)
    if (kind === "report" && rec.id) {
      const reportId = rec.id;
      const companyIds = ctx.companyIds;
      void (async () => {
        try {
          const reviewerIds = await resolveReportReviewers(adminPb, { companyIds });
          const filtered = reviewerIds.filter((uid) => uid !== ctx.userId);
          await notifyReportCreated(adminPb, { reviewerIds: filtered, reportId });
        } catch {
          // Never block the main response
        }
      })();
    }

    return NextResponse.json({ ok: true, data: sanitizeCaseForClient(ctx, rec) });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingClose(req: Request, kind: CaseKind, id: string) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    let body: Record<string, unknown> = {};
    try {
      body = jsonBody(await req.json());
    } catch {
      body = {};
    }
    const adminPb = await getInventoryAdminPb();
    const rec = await serverCloseCase(adminPb, ctx, kind, id, body.hr_note != null ? String(body.hr_note) : undefined);
    return NextResponse.json({ ok: true, data: sanitizeCaseForClient(ctx, rec) });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingListAttachments(req: Request, kind: CaseKind, id: string) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    const items = await serverListAttachments(adminPb, ctx, kind, id);
    return NextResponse.json({
      ok: true,
      items,
      count: items.length,
      max: REPORTING_MAX_ATTACHMENTS,
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingUploadAttachment(req: Request, kind: CaseKind, id: string) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new HrApiError("File bukti wajib diunggah.", 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const adminPb = await getInventoryAdminPb();
    const meta = await serverAddAttachment(adminPb, ctx, kind, id, {
      bytes,
      declaredMime: file.type,
      originalName: file.name || "evidence",
    });
    return NextResponse.json({ ok: true, data: meta });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingGetAttachmentFile(
  req: Request,
  kind: CaseKind,
  id: string,
  attId: string,
) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    const file = await serverReadAttachmentBytes(adminPb, ctx, kind, id, attId);
    return new NextResponse(Buffer.from(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function reportingDeleteAttachment(
  req: Request,
  kind: CaseKind,
  id: string,
  attId: string,
) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    await serverDeleteAttachment(adminPb, ctx, kind, id, attId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
