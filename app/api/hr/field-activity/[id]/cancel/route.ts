import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError, HrApiError } from "@/lib/hr/api-auth";
import { serverCancelFieldActivity } from "@/lib/hr/field-activity-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const auth = await getAuthenticatedHrUser(req);
    if (!auth) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    const result = await serverCancelFieldActivity(adminPb, auth, id);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: result.message, id: result.id });
  } catch (err) {
    return hrJsonError(err);
  }
}
