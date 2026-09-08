import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { readEmployeeDocumentBytes } from "@/lib/hr/employee-document-server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/profile/self/documents/[id]/file — protected document download/preview. */
export async function GET(req: Request, context: Ctx) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const { id } = await context.params;
    const url = new URL(req.url);
    const inline = url.searchParams.get("inline") === "1";
    const adminPb = await getInventoryAdminPb();
    const { bytes, mime, filename } = await readEmployeeDocumentBytes(
      adminPb,
      ctx,
      id,
      inline ? "view" : "download",
      req,
    );
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    };
    if (!inline) {
      headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(filename)}"`;
    } else {
      headers["Content-Disposition"] = `inline; filename="${encodeURIComponent(filename)}"`;
    }
    return new NextResponse(Buffer.from(bytes), { status: 200, headers });
  } catch (err) {
    return hrJsonError(err);
  }
}
