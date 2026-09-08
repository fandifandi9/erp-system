import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError } from "@/lib/hr/api-auth";
import { serverGetHrDeskWorkbenchSummary } from "@/lib/hr/desk-workbench-server";

/** GET /api/hr/desk-workbench-summary — scoped task counts for Meja Kerja HR (not auth). */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }
    const adminPb = await getInventoryAdminPb();
    const summary = await serverGetHrDeskWorkbenchSummary(adminPb, ctx);
    return NextResponse.json({ ok: true, data: summary });
  } catch (err) {
    return hrJsonError(err);
  }
}
