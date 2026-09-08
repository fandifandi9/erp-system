import { NextResponse } from "next/server";
import { bisnisApiError, requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import {
  ensureInvoiceAndStockFromSalesOrderServer,
} from "@/lib/bisnis/sales-from-so-server";

type Body = {
  wmsPickComplete?: boolean;
};

/** Pastikan invoice + stok SO — server-side (admin) agar bundle tidak 403 di browser. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePenjualanOrWmsApiUser(req);
    const { id: soId } = await ctx.params;
    if (!soId?.trim()) throw bisnisApiError("sales order id wajib.", 400);
    const body = (await req.json().catch(() => ({}))) as Body;

    const invoice = await ensureInvoiceAndStockFromSalesOrderServer(soId.trim(), auth.userId, {
      wmsPickComplete: body.wmsPickComplete !== false,
    });

    return NextResponse.json({
      ok: true,
      invoice_id: invoice.id,
      invoice_no: invoice.invoice_no,
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    const message = err instanceof Error ? err.message : "Gagal memastikan invoice.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
