import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { buildPayslipHtmlForActor } from "@/lib/hr/payroll-server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/payroll/self/slips/[id]/pdf — authenticated PDF/HTML download. */
export async function GET(req: Request, context: Ctx) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const { id } = await context.params;
    const url = new URL(req.url);
    const inline = url.searchParams.get("inline") === "1";
    const adminPb = await getInventoryAdminPb();
    const html = await buildPayslipHtmlForActor(adminPb, ctx, id, inline ? "view" : "download", req);
    const headers: Record<string, string> = {
      "Content-Type": inline ? "text/html; charset=utf-8" : "application/pdf",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    };
    if (!inline) {
      headers["Content-Disposition"] = `attachment; filename="slip-gaji-${id.slice(0, 8)}.html"`;
    }
    return new NextResponse(html, { status: 200, headers });
  } catch (err) {
    return hrJsonError(err);
  }
}
