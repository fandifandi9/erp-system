import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { fetchInvoiceByShareToken } from "@/lib/bisnis/invoice-share-token";
import { BISNIS_COLLECTIONS, type Store } from "@/lib/bisnis/types";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  try {
    const pb = await getInventoryAdminPb();
    const inv = await fetchInvoiceByShareToken(token, pb);

    if (inv.status === "cancelled") {
      return NextResponse.json({ error: "Invoice dibatalkan" }, { status: 410 });
    }

    let store: Pick<Store, "name" | "phone" | "email" | "address"> | null = null;
    const wh = inv.expand?.sales_order?.warehouse;
    if (wh) {
      const whEsc = String(wh).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const stores = await pb.collection(BISNIS_COLLECTIONS.stores).getFullList<Store>({
        filter: `default_warehouse = "${whEsc}" && is_active = true`,
        fields: "name,phone,email,address",
      });
      store = stores[0] ?? null;
    }

    return NextResponse.json({
      invoice_no: inv.invoice_no,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      total: inv.total,
      remaining: inv.remaining,
      paid_amount: inv.paid_amount,
      status: inv.status,
      customer_name: inv.expand?.customer?.name ?? "Pelanggan",
      store,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Tidak ditemukan";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
