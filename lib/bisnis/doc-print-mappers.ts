import type {
  Invoice,
  SalesOrder,
  SalesOrderLine,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseBill,
  Store,
  Supplier,
} from "@/lib/bisnis/types";
import type { BizDocumentPrintData, BizDocTotalsRow } from "@/lib/bisnis/doc-print-types";
import { bizDocFmtDate, bizDocFmtMoney, bizDocFmtNum } from "@/lib/bisnis/doc-print-format";
import {
  formatShippingDisplay,
  parseNotesWithShipping,
  SHIPPING_NOTES_MARKER,
} from "@/lib/bisnis/shipping-notes";
import {
  formatBankTransferDisplay,
  parseNotesWithBankTransfer,
  BANK_TRANSFER_MARKER,
} from "@/lib/bisnis/bank-transfer-notes";
import { parseReferenceFromNotes } from "@/lib/bisnis/reference-notes";
import {
  INTERNAL_PROCESS_MARKER,
  parseNotesWithInternalProcess,
} from "@/lib/bisnis/internal-process-notes";
import { isCashInvoice } from "@/lib/bisnis/invoice-status";
import { isCashPurchase } from "@/lib/bisnis/purchase-status";
import { marketplaceLabelFromInvoice } from "@/lib/bisnis/mp-invoice-meta";
import { formatPosNotesForDisplay } from "@/lib/pos/meta";
import {
  legalFooterFromIdentity,
  parseIdentitySnapshot,
  sellerFromIdentity,
} from "@/lib/tenant/document-identity";

function sellerFromStore(store: Store | null | undefined): BizDocumentPrintData["seller"] {
  return {
    name: store?.name || "—",
    address: store?.address,
    phone: store?.phone,
    email: store?.email,
  };
}

/** Baris milik blok marker (pengiriman/transfer) — jangan tampil di CATATAN. */
const BLOCK_FIELD_RE =
  /^(Expedisi|Layanan|Nomor lacak|Ongkir|Alamat penerima|Bank|Nama rekening|Nomor rekening):/i;

/** Buang sisa marker blok yang masih bocor ke teks catatan (mis. notes POS). */
function scrubLeftoverBlocks(text?: string): string | undefined {
  if (!text) return undefined;
  if (!text.includes(SHIPPING_NOTES_MARKER) && !text.includes(BANK_TRANSFER_MARKER) && !text.includes(INTERNAL_PROCESS_MARKER)) {
    return text;
  }
  const cleaned = text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return (
        t !== SHIPPING_NOTES_MARKER &&
        t !== BANK_TRANSFER_MARKER &&
        t !== INTERNAL_PROCESS_MARKER &&
        !BLOCK_FIELD_RE.test(t)
      );
    })
    .join("\n")
    .trim();
  return cleaned || undefined;
}

function parseDocNotes(raw?: string) {
  const posDisplay = formatPosNotesForDisplay(raw);
  const cleaned = posDisplay ?? raw ?? "";
  const { textNotes: notesNoBank, bank } = parseNotesWithBankTransfer(cleaned);
  const { textNotes: notesNoShip, shipping } = parseNotesWithShipping(notesNoBank);
  const { textNotes: notesPlain, internal: _internal } = parseNotesWithInternalProcess(notesNoShip);
  const { reference, body } = parseReferenceFromNotes(notesPlain);
  const shippingInfo =
    shipping.enabled && (shipping.courier.trim() || shipping.tracking_no.trim())
      ? {
          courier: shipping.courier.trim() || undefined,
          trackingNo: shipping.tracking_no.trim() || undefined,
        }
      : undefined;
  const paymentInfo = bank.enabled
    ? {
        method: "Transfer Bank",
        bank: bank.bank_name.trim() || undefined,
        accountNo: bank.account_number.trim() || undefined,
        accountName: bank.account_name.trim() || undefined,
      }
    : undefined;
  return {
    refNo: reference || undefined,
    notes: scrubLeftoverBlocks(body || posDisplay || undefined),
    bankNote: formatBankTransferDisplay(bank) || undefined,
    shippingNote: formatShippingDisplay(shipping) || undefined,
    shippingInfo,
    paymentInfo,
    shippingCost: shipping.enabled ? Math.max(0, shipping.shipping_cost || 0) : 0,
  };
}

function totalsRows(base: {
  subtotal: number;
  discount?: number;
  tax?: number;
  materai?: number;
  /** Ongkir (sudah termasuk dalam total) — hanya baris tampilan. */
  shipping?: number;
  total: number;
  totalLabel: string;
  paid?: number;
  remaining?: number;
}): BizDocTotalsRow[] {
  const rows: BizDocTotalsRow[] = [{ label: "Subtotal", value: bizDocFmtMoney(base.subtotal) }];
  if ((base.discount ?? 0) > 0) {
    rows.push({ label: "Diskon", value: `-${bizDocFmtMoney(base.discount!)}`, danger: true });
  }
  if ((base.tax ?? 0) > 0) {
    rows.push({ label: "PPN / Pajak", value: bizDocFmtMoney(base.tax!) });
  }
  if ((base.materai ?? 0) > 0) {
    rows.push({ label: "Materai", value: bizDocFmtMoney(base.materai!) });
  }
  if ((base.shipping ?? 0) > 0) {
    rows.push({ label: "Ongkir", value: bizDocFmtMoney(base.shipping!) });
  }
  rows.push({ label: base.totalLabel, value: bizDocFmtMoney(base.total), emphasis: true });
  if (base.paid != null) rows.push({ label: "Dibayar", value: bizDocFmtMoney(base.paid) });
  if (base.remaining != null) {
    rows.push({
      label: "Sisa tagihan",
      value: bizDocFmtMoney(base.remaining),
      danger: base.remaining > 0,
    });
  }
  return rows;
}

function salesLines(lines: SalesOrderLine[]): BizDocumentPrintData["lines"] {
  return lines.map((l) => ({
    product: l.expand?.product?.name || l.name_snapshot || "—",
    qty: bizDocFmtNum(l.qty),
    unitPrice: bizDocFmtMoney(l.unit_price),
    discount: l.discount_percent ? `${l.discount_percent}%` : undefined,
    lineTotal: bizDocFmtMoney(l.line_total),
  }));
}

function purchaseLines(lines: PurchaseOrderLine[]): BizDocumentPrintData["lines"] {
  return lines.map((l) => ({
    product: l.expand?.product?.name || "—",
    qty: bizDocFmtNum(l.qty),
    unitPrice: bizDocFmtMoney(l.unit_cost),
    lineTotal: bizDocFmtMoney(l.line_total),
  }));
}

export function buildSalesOrderPrintData(
  so: SalesOrder,
  lines: SalesOrderLine[],
  store: Store | null | undefined,
): BizDocumentPrintData {
  const notes = parseDocNotes(so.notes);
  const customer = so.expand?.customer;
  return {
    kind: "sales_order",
    docNo: so.order_no,
    docDate: bizDocFmtDate(so.order_date),
    dueDate: bizDocFmtDate(so.due_date),
    refNo: notes.refNo,
    seller: sellerFromStore(store),
    party: {
      title: "Pelanggan",
      name: customer?.name || "—",
      address: customer?.address,
      phone: customer?.phone,
      email: customer?.email,
    },
    lines: salesLines(lines),
    totals: totalsRows({
      subtotal: so.subtotal,
      discount: so.discount_amount,
      tax: so.tax_amount,
      materai: so.materai_amount,
      shipping: notes.shippingCost,
      total: so.total,
      totalLabel: "Total SO",
    }),
    bankNote: notes.bankNote,
    shippingNote: notes.shippingNote,
    shippingInfo: notes.shippingInfo,
    paymentInfo: notes.paymentInfo,
    notes: notes.notes,
  };
}

export function buildInvoicePrintData(
  invoice: Invoice,
  lines: SalesOrderLine[],
  store: Store | null | undefined,
  opts?: { cancelled?: boolean },
): BizDocumentPrintData {
  const notes = parseDocNotes(invoice.notes);
  const snapshot = parseIdentitySnapshot(invoice.identity_snapshot_json);
  const customer = invoice.expand?.customer;
  const cash = isCashInvoice(invoice);
  const isMp = invoice.source === "marketplace_import";
  const mpLabel = marketplaceLabelFromInvoice(invoice);
  const partyLines: { label: string; value: string }[] = [];
  if (isMp) {
    if (mpLabel) partyLines.push({ label: "Channel", value: mpLabel });
    if (invoice.mp_order_no) partyLines.push({ label: "Order MP", value: invoice.mp_order_no });
    if (invoice.mp_buyer_name) partyLines.push({ label: "Pembeli MP", value: invoice.mp_buyer_name });
  }
  return {
    kind: "invoice",
    docNo: invoice.invoice_no,
    docDate: bizDocFmtDate(invoice.issue_date),
    dueDate: cash ? undefined : bizDocFmtDate(invoice.due_date),
    refNo: notes.refNo || invoice.mp_order_no || undefined,
    linkedDoc: invoice.expand?.sales_order?.order_no
      ? `SO: ${invoice.expand.sales_order.order_no}`
      : undefined,
    paymentNote: cash ? "Pembayaran: Cash / Lunas" : undefined,
    seller: snapshot ? sellerFromIdentity(snapshot, store) : sellerFromStore(store),
    legalFooter: legalFooterFromIdentity(snapshot),
    party: {
      title: isMp ? "Kontak pembukuan" : "Ditagihkan kepada",
      name: customer?.name || "—",
      address: customer?.address,
      phone: customer?.phone,
      email: customer?.email,
      lines: partyLines.length ? partyLines : undefined,
    },
    lines: salesLines(lines),
    totals: totalsRows({
      subtotal: invoice.subtotal,
      discount: invoice.discount_amount,
      tax: invoice.tax_amount,
      materai: invoice.materai_amount,
      shipping: notes.shippingCost,
      total: invoice.total,
      totalLabel: "Total",
      paid: invoice.paid_amount,
      remaining: opts?.cancelled ? undefined : invoice.remaining,
    }),
    bankNote: notes.bankNote,
    shippingNote: notes.shippingNote,
    shippingInfo: notes.shippingInfo,
    paymentInfo: notes.paymentInfo ?? (cash ? { method: "Cash / Lunas" } : undefined),
    notes: notes.notes,
    footerNote: opts?.cancelled ? "Invoice dibatalkan — tidak masuk perhitungan laba rugi" : undefined,
  };
}

export function buildPurchaseOrderPrintData(
  po: PurchaseOrder,
  lines: PurchaseOrderLine[],
  store: Store | null | undefined,
  supplier?: Supplier | null,
): BizDocumentPrintData {
  const notes = parseDocNotes(po.notes);
  const sup = supplier ?? po.expand?.supplier;
  return {
    kind: "purchase_order",
    docNo: po.po_no,
    docDate: bizDocFmtDate(po.order_date),
    dueDate: bizDocFmtDate(po.expected_date),
    refNo: notes.refNo,
    paymentNote: "Dokumen: PO (belum tagihan)",
    seller: sellerFromStore(store),
    party: {
      title: "Supplier",
      name: sup?.name || "—",
      address: sup?.address,
      phone: sup?.phone,
      email: sup?.email,
    },
    lines: purchaseLines(lines),
    totals: totalsRows({
      subtotal: po.subtotal,
      discount: po.discount_amount,
      tax: po.tax_amount,
      materai: po.materai_amount,
      shipping: notes.shippingCost,
      total: po.total,
      totalLabel: "Total PO",
    }),
    bankNote: notes.bankNote,
    shippingNote: notes.shippingNote,
    shippingInfo: notes.shippingInfo,
    paymentInfo: notes.paymentInfo,
    notes: notes.notes,
  };
}

export function buildBillPrintData(
  bill: PurchaseBill,
  lines: PurchaseOrderLine[],
  store: Store | null | undefined,
  supplier?: Supplier | null,
  po?: PurchaseOrder | null,
  opts?: { cancelled?: boolean },
): BizDocumentPrintData {
  const rawNotes = bill.notes ?? po?.notes ?? "";
  const notes = parseDocNotes(rawNotes);
  const sup = supplier ?? bill.expand?.supplier;
  const cash = isCashPurchase(bill);
  return {
    kind: "bill",
    docNo: bill.bill_no,
    docDate: bizDocFmtDate(bill.bill_date),
    dueDate: cash ? undefined : bizDocFmtDate(bill.due_date),
    refNo: notes.refNo,
    linkedDoc: po?.po_no
      ? `PO: ${po.po_no}`
      : bill.expand?.purchase_order?.po_no
        ? `PO: ${bill.expand.purchase_order.po_no}`
        : undefined,
    paymentNote: cash ? "Pembayaran: Cash / Lunas" : undefined,
    seller: sellerFromStore(store),
    party: {
      title: "Supplier",
      name: sup?.name || "—",
      address: sup?.address,
      phone: sup?.phone,
      email: sup?.email,
    },
    lines: purchaseLines(lines),
    totals: totalsRows({
      subtotal: bill.subtotal,
      discount: bill.discount_amount,
      tax: bill.tax_amount,
      materai: bill.materai_amount,
      shipping: notes.shippingCost,
      total: bill.total,
      totalLabel: "Total",
      paid: bill.paid_amount,
      remaining: opts?.cancelled ? undefined : bill.remaining,
    }),
    bankNote: notes.bankNote,
    shippingNote: notes.shippingNote,
    shippingInfo: notes.shippingInfo,
    paymentInfo: notes.paymentInfo ?? (cash ? { method: "Cash / Lunas" } : undefined),
    notes: notes.notes,
    footerNote: opts?.cancelled ? "Tagihan dibatalkan — hanya arsip" : undefined,
  };
}
