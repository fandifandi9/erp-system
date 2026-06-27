export type BizDocKind = "invoice" | "sales_order" | "purchase_order" | "bill";

export type BizDocSeller = {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
};

export type BizDocParty = {
  title: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  lines?: { label: string; value: string }[];
};

export type BizDocLine = {
  product: string;
  qty: string;
  unitPrice: string;
  discount?: string;
  lineTotal: string;
};

export type BizDocTotalsRow = {
  label: string;
  value: string;
  emphasis?: boolean;
  danger?: boolean;
};

/** Info pengiriman terstruktur (display-only, dari blok notes). */
export type BizDocShippingInfo = {
  courier?: string;
  trackingNo?: string;
};

/** Info pembayaran terstruktur (display-only, dari blok notes). */
export type BizDocPaymentInfo = {
  method?: string;
  bank?: string;
  accountNo?: string;
  accountName?: string;
};

export type BizDocumentPrintData = {
  kind: BizDocKind;
  docNo: string;
  docDate: string;
  dueDate?: string;
  refNo?: string;
  linkedDoc?: string;
  paymentNote?: string;
  seller: BizDocSeller;
  party: BizDocParty;
  lines: BizDocLine[];
  totals: BizDocTotalsRow[];
  bankNote?: string;
  shippingNote?: string;
  /** Versi terstruktur dari shippingNote — section INFORMASI PENGIRIMAN. */
  shippingInfo?: BizDocShippingInfo;
  /** Versi terstruktur dari bankNote — section INFORMASI PEMBAYARAN. */
  paymentInfo?: BizDocPaymentInfo;
  notes?: string;
  footerNote?: string;
  /** Footer legal company (NPWP) — bukan SERBA System */
  legalFooter?: string;
};

export const BIZ_DOC_KIND_META: Record<
  BizDocKind,
  { title: string; subtitle: string; totalLabel: string }
> = {
  invoice: { title: "INVOICE", subtitle: "Faktur penjualan", totalLabel: "Total tagihan" },
  sales_order: { title: "SALES ORDER", subtitle: "Pesanan penjualan", totalLabel: "Total SO" },
  purchase_order: { title: "PURCHASE ORDER", subtitle: "Pesanan pembelian", totalLabel: "Total PO" },
  bill: { title: "TAGIHAN PEMBELIAN", subtitle: "Bill / tagihan supplier", totalLabel: "Total tagihan" },
};
