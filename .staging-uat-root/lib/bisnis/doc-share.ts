import type { EmailDocKind } from "@/lib/email/document-kind";
import { bizDocFmtDate } from "@/lib/bisnis/doc-print-format";
import { isCashInvoice } from "@/lib/bisnis/invoice-status";
import type { Invoice, PurchaseOrder, SalesOrder, Store } from "./types";

const fmtIdr = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

/** URL pratinjau penuh — dibuka di tab baru (`?view=1`). */
export function sharePreviewUrl(publicUrl: string): string {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(publicUrl, base);
    u.searchParams.set("view", "1");
    return u.toString();
  } catch {
    const sep = publicUrl.includes("?") ? "&" : "?";
    return `${publicUrl}${sep}view=1`;
  }
}

export function openSharePreviewInNewTab(publicUrl: string): boolean {
  if (typeof window === "undefined") return false;
  const win = window.open(sharePreviewUrl(publicUrl), "_blank", "noopener,noreferrer");
  return Boolean(win);
}

export type SalesDocShareKind = "invoice" | "sales_order" | "quotation";
export type PurchaseDocShareKind = "purchase_order";
export type DocShareKind = EmailDocKind;

export function salesDocDetailPath(id: string): string {
  return `/bisnis/penjualan/${id}`;
}

/** Link publik untuk pelanggan (tanpa login), seperti pratinjau Jurnal. */
export function invoiceSharePublicPath(id: string): string {
  return `/share/invoice/${id}`;
}

export function salesOrderSharePublicPath(id: string): string {
  return `/share/so/${id}`;
}

export function quotationSharePublicPath(id: string): string {
  return `/share/quotation/${id}`;
}

export function purchaseOrderSharePublicPath(id: string): string {
  return `/share/po/${id}`;
}

export function docSharePublicPath(kind: DocShareKind, id: string): string {
  switch (kind) {
    case "invoice":
      return invoiceSharePublicPath(id);
    case "quotation":
      return quotationSharePublicPath(id);
    case "purchase_order":
      return purchaseOrderSharePublicPath(id);
    case "sales_order":
    default:
      return salesOrderSharePublicPath(id);
  }
}

export function salesDocPublicUrl(kind: SalesDocShareKind, id: string): string {
  return docPublicUrl(kind, id);
}

export function docPublicUrl(kind: DocShareKind, id: string): string {
  const path = docSharePublicPath(kind, id);
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/** Nomor WA internasional (62…) atau null jika tidak valid. */
export function normalizeWhatsAppPhone(phone?: string | null): string | null {
  if (!phone?.trim()) return null;
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = `62${p.slice(1)}`;
  else if (!p.startsWith("62")) p = `62${p}`;
  if (p.length < 10) return null;
  return p;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Buka WA di tab baru — jangan ganti tab ERP (penting untuk WhatsApp Web). */
export function openWhatsAppShare(phone: string, message: string): boolean {
  const url = buildWhatsAppUrl(phone, message);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(win);
}

/** Toko penjual dari daftar toko (header nota / dokumen). */
export function resolveStoreForSalesDoc(
  stores: Store[],
  warehouseId?: string | null,
): Store | null {
  if (!stores.length) return null;
  if (warehouseId) {
    return stores.find((s) => s.default_warehouse === warehouseId) ?? stores[0];
  }
  return stores[0];
}

export function resolveStoreForInvoice(invoice: Invoice, stores: Store[]): Store | null {
  const wh =
    invoice.expand?.sales_order?.warehouse ??
    (typeof invoice.expand?.sales_order === "object"
      ? invoice.expand?.sales_order?.warehouse
      : undefined);
  return resolveStoreForSalesDoc(stores, wh);
}

export function resolveStoreForSalesOrder(order: SalesOrder, stores: Store[]): Store | null {
  return resolveStoreForSalesDoc(stores, order.warehouse);
}

export function resolveStoreForPurchaseOrder(po: PurchaseOrder, stores: Store[]): Store | null {
  return resolveStoreForSalesDoc(stores, po.warehouse);
}

function sellerContactLines(store: Store | null | undefined): string[] {
  if (!store) return [];
  const lines = ["", "---", store.name];
  if (store.phone?.trim()) lines.push(`Hubungi kami (WA/Telp): ${store.phone.trim()}`);
  if (store.email?.trim()) lines.push(`Email: ${store.email.trim()}`);
  return lines;
}

export function buildInvoiceShareMessage(inv: Invoice, store?: Store | null): string {
  const customer = inv.expand?.customer?.name ?? "Pelanggan";
  const url = salesDocPublicUrl("invoice", inv.id);
  const lines = [
    `Halo ${customer},`,
    "",
    `Berikut invoice *${inv.invoice_no}*:`,
    `Total: ${fmtIdr(inv.total ?? 0)}`,
  ];
  if ((inv.remaining ?? 0) > 0 && inv.status !== "cancelled") {
    lines.push(`Sisa tagihan: ${fmtIdr(inv.remaining ?? 0)}`);
    if (!isCashInvoice(inv)) {
      const dueLabel = bizDocFmtDate(inv.due_date);
      if (dueLabel !== "—") {
        lines.push(`Jatuh tempo: ${dueLabel}`);
      }
    }
  }
  lines.push("", `Lihat & cetak: ${url}`);
  lines.push(...sellerContactLines(store));
  lines.push("", "Terima kasih.");
  return lines.join("\n");
}

export function buildSalesOrderShareMessage(so: SalesOrder, store?: Store | null): string {
  const customer = so.expand?.customer?.name ?? "Pelanggan";
  const url = docPublicUrl("sales_order", so.id);
  return [
    `Halo ${customer},`,
    "",
    `Berikut Sales Order *${so.order_no}*:`,
    `Total: ${fmtIdr(so.total ?? 0)}`,
    `Tanggal: ${bizDocFmtDate(so.order_date)}`,
    "",
    `Lihat & cetak: ${url}`,
    ...sellerContactLines(store),
    "",
    "Terima kasih.",
  ].join("\n");
}

export function buildQuotationShareMessage(so: SalesOrder, store?: Store | null): string {
  const customer = so.expand?.customer?.name ?? "Pelanggan";
  const url = docPublicUrl("quotation", so.id);
  return [
    `Halo ${customer},`,
    "",
    `Berikut *penawaran* *${so.order_no}*:`,
    `Total: ${fmtIdr(so.total ?? 0)}`,
    `Tanggal: ${bizDocFmtDate(so.order_date)}`,
    "",
    `Lihat & cetak: ${url}`,
    ...sellerContactLines(store),
    "",
    "Terima kasih.",
  ].join("\n");
}

export function buildPurchaseOrderShareMessage(po: PurchaseOrder, store?: Store | null): string {
  const supplier = po.expand?.supplier?.name ?? "Supplier";
  const url = docPublicUrl("purchase_order", po.id);
  return [
    `Halo ${supplier},`,
    "",
    `Berikut Purchase Order *${po.po_no}*:`,
    `Total: ${fmtIdr(po.total ?? 0)}`,
    `Tanggal: ${bizDocFmtDate(po.order_date)}`,
    po.expected_date ? `Perkiraan terima: ${bizDocFmtDate(po.expected_date)}` : "",
    "",
    `Lihat & cetak: ${url}`,
    ...sellerContactLines(store),
    "",
    "Terima kasih.",
  ]
    .filter(Boolean)
    .join("\n");
}

export type DocSharePayload = {
  docKind: DocShareKind;
  docId: string;
  message: string;
  subject: string;
  /** Email penerima (pelanggan) */
  toEmail?: string;
  /** Nomor WA penerima (pelanggan), format 62… */
  toPhone: string | null;
  url: string;
  /** Kontak penjual dari daftar toko */
  seller?: { name: string; phone?: string; email?: string };
};

export function invoiceSharePayload(inv: Invoice, store?: Store | null): DocSharePayload {
  const customer = inv.expand?.customer;
  return {
    docKind: "invoice",
    docId: inv.id,
    message: buildInvoiceShareMessage(inv, store),
    subject: `${store?.name ? `${store.name} — ` : ""}Invoice ${inv.invoice_no}`,
    toEmail: customer?.email?.trim() || undefined,
    toPhone: normalizeWhatsAppPhone(customer?.phone),
    url: docPublicUrl("invoice", inv.id),
    seller: store
      ? { name: store.name, phone: store.phone, email: store.email }
      : undefined,
  };
}

export function salesOrderSharePayload(so: SalesOrder, store?: Store | null): DocSharePayload {
  const customer = so.expand?.customer;
  return {
    docKind: "sales_order",
    docId: so.id,
    message: buildSalesOrderShareMessage(so, store),
    subject: `${store?.name ? `${store.name} — ` : ""}Sales Order ${so.order_no}`,
    toEmail: customer?.email?.trim() || undefined,
    toPhone: normalizeWhatsAppPhone(customer?.phone),
    url: docPublicUrl("sales_order", so.id),
    seller: store
      ? { name: store.name, phone: store.phone, email: store.email }
      : undefined,
  };
}

export function quotationSharePayload(so: SalesOrder, store?: Store | null): DocSharePayload {
  const customer = so.expand?.customer;
  return {
    docKind: "quotation",
    docId: so.id,
    message: buildQuotationShareMessage(so, store),
    subject: `${store?.name ? `${store.name} — ` : ""}Penawaran ${so.order_no}`,
    toEmail: customer?.email?.trim() || undefined,
    toPhone: normalizeWhatsAppPhone(customer?.phone),
    url: docPublicUrl("quotation", so.id),
    seller: store
      ? { name: store.name, phone: store.phone, email: store.email }
      : undefined,
  };
}

export function purchaseOrderSharePayload(
  po: PurchaseOrder,
  store?: Store | null,
): DocSharePayload {
  const supplier = po.expand?.supplier;
  return {
    docKind: "purchase_order",
    docId: po.id,
    message: buildPurchaseOrderShareMessage(po, store),
    subject: `${store?.name ? `${store.name} — ` : ""}Purchase Order ${po.po_no}`,
    toEmail: supplier?.email?.trim() || undefined,
    toPhone: normalizeWhatsAppPhone(supplier?.phone),
    url: docPublicUrl("purchase_order", po.id),
    seller: store
      ? { name: store.name, phone: store.phone, email: store.email }
      : undefined,
  };
}

/** @deprecated use invoiceSharePayload */
export function invoiceShareMeta(inv: Invoice, store?: Store | null) {
  const p = invoiceSharePayload(inv, store);
  return {
    message: p.message,
    subject: p.subject,
    email: p.toEmail,
    phone: p.toPhone,
    url: p.url,
  };
}

/** @deprecated use salesOrderSharePayload */
export function salesOrderShareMeta(so: SalesOrder, store?: Store | null) {
  const p = salesOrderSharePayload(so, store);
  return {
    message: p.message,
    subject: p.subject,
    email: p.toEmail,
    phone: p.toPhone,
    url: p.url,
  };
}
