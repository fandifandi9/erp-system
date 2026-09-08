import { NextResponse } from "next/server";
import { requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Invoice, type SalesOrderLine } from "@/lib/bisnis/types";
import {
  ensureInvoiceShareToken,
  invoiceSharePublicUrl,
} from "@/lib/bisnis/invoice-share-token";
import { parseIdentitySnapshot } from "@/lib/tenant/document-identity";
import { mergeOutboundLinesFromSoExpanded } from "@/lib/wms/outbound-bundle-expand";

export type InvoiceQrPackingLine = {
  sku: string;
  name: string;
  qty: number;
};

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
        { sort: "-created", expand: "sales_order,store", requestKey: null },
      );
    } catch {
      return NextResponse.json({ ok: false, reason: "no_invoice" });
    }

    const origin = new URL(req.url).origin;
    const shareToken = await ensureInvoiceShareToken(inv.id, adminPb);
    const publicUrl = invoiceSharePublicUrl(shareToken, origin);

    let storeName =
      inv.expand?.store?.name?.trim() ||
      parseIdentitySnapshot(inv.identity_snapshot_json)?.store_name?.trim() ||
      "";

    if (!storeName && inv.store) {
      try {
        const store = await adminPb.collection(BISNIS_COLLECTIONS.stores).getOne<{ name?: string }>(
          inv.store,
          { fields: "name", requestKey: null },
        );
        storeName = store.name?.trim() || "";
      } catch {
        /* abaikan */
      }
    }

    if (!storeName) {
      const soStoreId = inv.expand?.sales_order?.store;
      if (soStoreId) {
        try {
          const store = await adminPb
            .collection(BISNIS_COLLECTIONS.stores)
            .getOne<{ name?: string }>(soStoreId, { fields: "name", requestKey: null });
          storeName = store.name?.trim() || "";
        } catch {
          /* abaikan */
        }
      }
    }

    let packingList: InvoiceQrPackingLine[] = [];
    try {
      const lines = await adminPb
        .collection(BISNIS_COLLECTIONS.salesOrderLines)
        .getFullList<SalesOrderLine>({
          filter: `sales_order = "${esc}"`,
          expand: "product",
          requestKey: null,
        });
      // Sama seperti Validasi/QC: bundle di-expand ke komponen fisik (SKU yang di-scan).
      const merged = await mergeOutboundLinesFromSoExpanded(adminPb, { stage: "picking" }, lines);
      packingList = Object.values(merged.pick?.lines ?? {})
        .filter((l) => (Number(l.qty_required) || 0) > 0)
        .map((l) => ({
          sku: (l.sku || "—").trim() || "—",
          name: (l.name || "—").trim() || "—",
          qty: Number(l.qty_required) || 0,
        }))
        .sort((a, b) => a.sku.localeCompare(b.sku, "id"));
    } catch {
      packingList = [];
    }

    return NextResponse.json({
      ok: true,
      invoice_id: inv.id,
      invoice_no: inv.invoice_no,
      share_token: shareToken,
      public_url: publicUrl,
      qr_payload: publicUrl,
      store_name: storeName || null,
      packing_list: packingList,
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
