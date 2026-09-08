import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireOwnerOrHrApiUser,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverRejectLeave } from "@/lib/hr/leave-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      throw new HrApiError("ID pengajuan wajib.", 400);
    }

    const auth = await requireOwnerOrHrApiUser(req);

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    rejectClientPrivilegeFields(body);

    const reason = String(body.reason ?? body.rejection_reason ?? "");

    const adminPb = await getInventoryAdminPb();
    const result = await serverRejectLeave(adminPb, auth, id.trim(), reason);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.message, message: result.message },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, message: result.message, id: result.id });
  } catch (err) {
    return hrJsonError(err);
  }
}
