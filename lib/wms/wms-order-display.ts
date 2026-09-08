import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder, type SalesOrderLine } from "@/lib/bisnis/types";
import { getProductImageUrl } from "@/lib/inventory/client";
import type { InvProduct } from "@/lib/inventory/types";
import { parseOutboundWorkflow, type OutboundLineState } from "./outbound-workflow";
import { roomLabel } from "@/lib/inventory/product-slot-placement";
import type { InvLocation } from "@/lib/inventory/types";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { getPackageIdentityView } from "./package-identity";

export type WmsOrderLineView = {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  picked: number;
  validated: number;
  slotLabel: string | null;
  imageUrl: string | null;
  /** Label bundle sumber — komponen fisik untuk bundle di SO. */
  bundleLabel?: string;
};

export type WmsOrderHeader = {
  orderNo: string;
  invoiceNo: string | null;
  /** Satu identitas aktif — AWB atau Internal Package Code. */
  packageCode: string;
  packageCodeType: "awb" | "internal";
  packageCodeLabel: string;
  warehouseName: string;
  customerName: string;
  courier: string;
  recipientAddress: string;
  internalCodeHistory: string[];
};

export function buildWmsOrderHeader(so: SalesOrder): WmsOrderHeader {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const meta = wf.order_meta;
  const pkg = getPackageIdentityView(so, wf);
  const { shipping } = parseNotesWithShipping(so.notes ?? "");

  return {
    orderNo: so.order_no,
    invoiceNo: meta?.invoice_no ?? null,
    packageCode: pkg.code,
    packageCodeType: pkg.type,
    packageCodeLabel: pkg.typeLabel,
    warehouseName: meta?.warehouse_name ?? so.expand?.warehouse?.name ?? "—",
    customerName: meta?.customer_name ?? so.expand?.customer?.name ?? "—",
    courier: meta?.courier ?? shipping.courier ?? "—",
    recipientAddress: meta?.recipient_address ?? "—",
    internalCodeHistory: pkg.internalHistory,
  };
}

export function buildWmsLineViews(
  soLines: SalesOrderLine[],
  wfLines: Record<string, { qty_picked?: number; qty_validated?: number; sku?: string; name?: string }>,
  slotByProduct: Record<string, InvLocation>,
  productExpand?: Record<string, InvProduct>,
): WmsOrderLineView[] {
  return soLines.map((l) => {
    const wfLine = wfLines[l.product] ?? {};
    const prod = productExpand?.[l.product] ?? (l.expand?.product as InvProduct | undefined);
    const name = l.name_snapshot || prod?.name || l.product;
    const slot = slotByProduct[l.product];
    return {
      productId: l.product,
      sku: l.sku_snapshot || prod?.sku || "—",
      name,
      qty: Number(l.qty) || 0,
      picked: wfLine.qty_picked ?? 0,
      validated: wfLine.qty_validated ?? 0,
      slotLabel: slot ? roomLabel(slot) : null,
      imageUrl: prod ? getProductImageUrl(prod, "80x80") : null,
    };
  });
}

/** Baris pick/validasi dari workflow — bundle sudah di-expand ke komponen. */
export function buildWmsLineViewsFromPickLines(
  pickLines: Record<string, OutboundLineState>,
  slotByProduct: Record<string, InvLocation>,
  productExpand?: Record<string, InvProduct>,
): WmsOrderLineView[] {
  return Object.values(pickLines).map((wfLine) => {
    const productId = wfLine.product_id;
    const prod = productExpand?.[productId];
    const name = wfLine.name || prod?.name || productId;
    const slot = slotByProduct[productId];
    return {
      productId,
      sku: wfLine.sku || prod?.sku || "—",
      name,
      qty: wfLine.qty_required,
      picked: wfLine.qty_picked ?? 0,
      validated: wfLine.qty_validated ?? 0,
      slotLabel: slot ? roomLabel(slot) : null,
      imageUrl: prod ? getProductImageUrl(prod, "80x80") : null,
      bundleLabel: wfLine.for_bundle_label,
    };
  });
}

export async function fetchInvoiceNoForSo(soId: string): Promise<string | null> {
  try {
    const res = await pb.collection(BISNIS_COLLECTIONS.invoices).getList(1, 1, {
      filter: `sales_order = "${soId}"`,
      fields: "invoice_no",
      sort: "-created",
      requestKey: null,
    });
    return res.items[0]?.invoice_no ?? null;
  } catch {
    return null;
  }
}

/**
 * Nomor invoice untuk tampilan — meta → DB saja (ringan).
 * Tidak memanggil ensure-invoice (itu di pick ACC / complete_pickup).
 * Tidak fallback ke nomor SO.
 */
export async function resolveInvoiceNoForSo(so: SalesOrder): Promise<string> {
  const meta = parseOutboundWorkflow(so.outbound_workflow_json).order_meta?.invoice_no?.trim();
  if (meta) return meta;

  const fromDb = (await fetchInvoiceNoForSo(so.id))?.trim();
  if (fromDb) return fromDb;

  return "—";
}
