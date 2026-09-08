import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import {
  serverGetReviewerTask,
  serverSaveReviewerDraft,
  serverSubmitReviewer,
} from "@/lib/hr/rating-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getAuthenticatedHrUser(req);
    if (!auth) throw new HrApiError("Login diperlukan.", 401);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const data = await serverGetReviewerTask(adminPb, auth, id);
    // Extra privacy: if requester is the reviewer, strip other reviewers (already single row)
    if (String((data.reviewer as { reviewer?: string }).reviewer) === auth.userId) {
      return NextResponse.json({ ok: true, ...data });
    }
    if (!auth.isOwner && !auth.isHr) throw new HrApiError("Akses ditolak.", 403);
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const auth = await getAuthenticatedHrUser(req);
    if (!auth) throw new HrApiError("Login diperlukan.", 401);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const scores = Array.isArray(body.scores) ? body.scores : [];
    const row = await serverSaveReviewerDraft(adminPb, auth, id, {
      scores: scores.map((s: Record<string, unknown>) => ({
        aspect_id: String(s.aspect_id || ""),
        score: Number(s.score),
        comment: s.comment != null ? String(s.comment) : undefined,
      })),
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await getAuthenticatedHrUser(req);
    if (!auth) throw new HrApiError("Login diperlukan.", 401);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    if (String(body.action || "submit") !== "submit") {
      throw new HrApiError("Action tidak didukung.", 400);
    }
    const adminPb = await getInventoryAdminPb();
    const row = await serverSubmitReviewer(adminPb, auth, id);
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    return hrJsonError(err);
  }
}
