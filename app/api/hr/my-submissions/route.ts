import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError, HrApiError } from "@/lib/hr/api-auth";
import { serverListMySubmissions } from "@/lib/hr/my-submissions-server";

/** GET — personal submissions inbox (leave / OT / izin-field). */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    const items = await serverListMySubmissions(adminPb, ctx);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}
