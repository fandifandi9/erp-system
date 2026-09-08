import { NextResponse } from "next/server";
import { requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Invoice } from "@/lib/bisnis/types";
import {
  ensureInvoiceShareToken,
  invoiceSharePublicUrl,
} from "@/lib/bisnis/invoice-share-token";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requirePenjualanOrWmsApiUser(req);
    const { id: soId } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const esc = soId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let inv: Invoice;
    try {
      inv = await adminPb.collection(BISNIS_COLLECTIONS.invoices).getFirstListItem<Invoice>(
        `sales_order = "${esc}"`,
        { sort: "-created", requestKey: null },
      );
    } catch {
      return NextResponse.json({ ok: false, reason: "no_invoice" });
    }

    const origin = new URL(req.url).origin;
    const shareToken = await ensureInvoiceShareToken(inv.id, adminPb);
    const publicUrl = invoiceSharePublicUrl(shareToken, origin);

    return NextResponse.json({
      ok: true,
      invoice_id: inv.id,
      invoice_no: inv.invoice_no,
      share_token: shareToken,
      public_url: publicUrl,
      qr_payload: publicUrl,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal memuat QR invoice" },
      { status },
    );
  }
}
