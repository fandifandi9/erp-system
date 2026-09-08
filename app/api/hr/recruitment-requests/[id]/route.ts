import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  HrApiError,
  hrJsonError,
  rejectClientPrivilegeFields,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import {
  actorCanApproveRecruitmentRequest,
  serverGetRecruitmentRequest,
} from "@/lib/hr/recruitment-request-server";

type Ctx = { params: Promise<{ id: string }> };

/** GET one — only authorized approver (or Owner) may view. */
export async function GET(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const item = await serverGetRecruitmentRequest(adminPb, id);
    if (!item) throw new HrApiError("Permohonan tidak ditemukan.", 404);

    const can =
      item.status === "PENDING"
        ? await actorCanApproveRecruitmentRequest(adminPb, ctx, item)
        : ctx.isOwner || item.reviewedBy === ctx.userId || item.requestedBy === ctx.userId;
    if (!can && !ctx.isOwner) {
      throw new HrApiError("Anda tidak berwenang melihat permohonan ini.", 403);
    }
    return NextResponse.json({ ok: true, data: item });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function POST(req: Request) {
  const ctx = await requireAuthenticatedHrUser(req);
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
  } catch (err) {
    return hrJsonError(err);
  }
  return NextResponse.json({ ok: false, error: "Gunakan /approve atau /reject." }, { status: 405 });
}
