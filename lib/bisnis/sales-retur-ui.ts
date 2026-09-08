import type { Invoice, Retur, SalesOrder } from "@/lib/bisnis/types";
import { canCreateSalesRetur } from "@/lib/bisnis/sales-retur-guards";

/** Retur masih berjalan (belum selesai / dibatalkan). */
export function isActiveSalesRetur(
  r: Pick<Retur, "status" | "workflow_phase">,
): boolean {
  if (r.status === "cancelled" || r.status === "completed") return false;
  if (r.workflow_phase === "completed" || r.workflow_phase === "cancelled") return false;
  return true;
}

/** Retur aktif pertama (jika ada). */
export function findActiveSalesRetur(returs: Retur[]): Retur | null {
  return returs.find(isActiveSalesRetur) ?? null;
}

/** Retur untuk ditampilkan: aktif dulu, lalu retur terakhir yang tidak dibatalkan. */
export function findViewableSalesRetur(returs: Retur[]): Retur | null {
  return (
    findActiveSalesRetur(returs) ??
    returs.find((r) => r.status !== "cancelled") ??
    null
  );
}

/** Retur penjualan hanya dari penjualan yang sudah punya invoice aktif. */
export function canShowSalesReturUi(input: {
  salesOrder?: Pick<SalesOrder, "status"> | null;
  invoice?: Pick<Invoice, "status"> | null;
  hasInvoice?: boolean;
  /** Jika ada retur aktif, jangan tampilkan aksi buat retur. */
  hasActiveRetur?: boolean;
}): boolean {
  if (input.hasActiveRetur) return false;
  if (!input.salesOrder) return false;
  if (!input.hasInvoice && !input.invoice) return false;
  if (input.invoice?.status === "cancelled") return false;
  return canCreateSalesRetur(input.salesOrder);
}

export function salesReturBlockedHint(input: {
  salesOrder?: Pick<SalesOrder, "status"> | null;
  invoice?: Pick<Invoice, "status"> | null;
  hasInvoice?: boolean;
}): string | null {
  if (!input.salesOrder) return "Retur membutuhkan sales order terhubung.";
  if (!input.hasInvoice && !input.invoice) {
    return "Buat invoice dulu — retur hanya untuk penjualan yang sudah terjadi (ada invoice).";
  }
  if (input.invoice?.status === "cancelled") return "Invoice dibatalkan — tidak bisa retur.";
  if (!canCreateSalesRetur(input.salesOrder)) {
    return `Status penjualan "${input.salesOrder.status}" belum bisa diretur. Minimal sudah dikonfirmasi / terkirim.`;
  }
  return null;
}

export type SalesReturDocLabels = {
  returNo: string;
  invoiceNo?: string;
  soNo?: string;
};

export function salesReturDocLabels(
  retur: Pick<Retur, "retur_no" | "platform_retur_no" | "invoice" | "sales_order" | "reference_id"> & {
    expand?: Retur["expand"];
  },
  extras?: {
    invoice?: Pick<Invoice, "invoice_no"> | null;
    salesOrder?: Pick<SalesOrder, "order_no"> | null;
  },
): SalesReturDocLabels {
  const platform = retur.platform_retur_no?.trim();
  return {
    returNo: platform || retur.retur_no,
    invoiceNo:
      extras?.invoice?.invoice_no ??
      (retur.expand as { invoice?: { invoice_no?: string } } | undefined)?.invoice?.invoice_no,
    soNo:
      extras?.salesOrder?.order_no ??
      (retur.expand as { sales_order?: { order_no?: string } } | undefined)?.sales_order?.order_no,
  };
}

export function formatSalesReturDocLine(labels: SalesReturDocLabels): string {
  const parts = [labels.returNo];
  if (labels.invoiceNo) parts.push(`INV ${labels.invoiceNo}`);
  if (labels.soNo) parts.push(`SO ${labels.soNo}`);
  return parts.join(" · ");
}
