import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type Customer, type PaymentMethodSetting, type PaymentTerm } from "./types";
import type { ImportOrderHeader } from "./mp-import-schema";
import { buildNotesWithShipping, type ShippingInfo } from "./shipping-notes";
import { prependReferenceToNotes } from "./reference-notes";
import { findPaymentMethod } from "./payment-method-value";
import { buildMarketplaceInvoiceNotes } from "./mp-invoice-meta";

export async function findCustomerByName(name: string): Promise<Customer | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/"/g, '\\"');
  try {
    const list = await pb.collection(BISNIS_COLLECTIONS.customers).getFullList<Customer>({
      filter: `name = "${escaped}"`,
      requestKey: null,
    });
    const exact = list.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
    return exact ?? list[0] ?? null;
  } catch {
    const all = await pb.collection(BISNIS_COLLECTIONS.customers).getFullList<Customer>({
      sort: "name",
      requestKey: null,
    });
    return all.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()) ?? null;
  }
}

export function resolvePaymentMethodId(
  methods: PaymentMethodSetting[],
  label?: string,
): string | undefined {
  if (!label?.trim()) return undefined;
  return findPaymentMethod(methods, label.trim())?.id;
}

export function resolvePaymentTerm(
  terms: PaymentTerm[],
  label?: string,
  orderDate?: string,
): { termId?: string; dueDate?: string } {
  if (!label?.trim()) return {};
  const norm = label.trim().toLowerCase();
  const term =
    terms.find((t) => t.id === label) ||
    terms.find((t) => t.name.trim().toLowerCase() === norm) ||
    terms.find((t) => String(t.days) === norm);
  if (!term) return {};
  let dueDate: string | undefined;
  if (orderDate && term.days > 0) {
    const d = new Date(orderDate);
    d.setDate(d.getDate() + term.days);
    dueDate = d.toISOString().slice(0, 10);
  }
  return { termId: term.id, dueDate };
}

export function calcLineTotal(qty: number, unitPrice: number, discountPercent: number): number {
  const gross = qty * unitPrice;
  return Math.round(gross - gross * (discountPercent / 100));
}

export type OrderTotals = {
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  materai_amount: number;
  shipping_amount: number;
  total: number;
};

export function calcOrderTotals(
  lineTotals: number[],
  header: ImportOrderHeader,
): OrderTotals {
  const subtotal = lineTotals.reduce((s, n) => s + n, 0);
  const extraDiscount =
    header.diskon_order_tipe === "nominal"
      ? Math.min(subtotal, header.diskon_order ?? 0)
      : Math.round(subtotal * ((header.diskon_order ?? 0) / 100));
  const afterDiscount = subtotal - extraDiscount;
  const taxPct = header.ppn_persen ?? 0;
  const tax_amount = header.harga_termasuk_ppn
    ? Math.round((afterDiscount * taxPct) / (100 + taxPct || 1))
    : Math.round(afterDiscount * (taxPct / 100));
  const taxBase = header.harga_termasuk_ppn ? afterDiscount - tax_amount : afterDiscount;
  const shipping_amount = Math.max(0, header.ongkir ?? 0);
  const materai_amount = Math.max(0, header.materai ?? 0);
  const total = Math.round(taxBase + tax_amount + shipping_amount + materai_amount);
  return {
    subtotal,
    discount_amount: extraDiscount,
    tax_amount,
    materai_amount,
    shipping_amount,
    total,
  };
}

export function buildShippingFromHeader(header: ImportOrderHeader): ShippingInfo {
  const enabled = !!(header.ekspedisi || header.no_resi || header.ongkir || header.alamat_kirim);
  return {
    enabled,
    courier: header.ekspedisi ?? "",
    shipping_service: "",
    tracking_no: header.no_resi ?? "",
    shipping_cost: header.ongkir ?? 0,
    recipient_address: header.alamat_kirim ?? "",
  };
}

export function buildImportSoNotes(
  header: ImportOrderHeader,
  mpFeeNotes: string,
): string {
  const textParts = [header.pesan, header.memo].filter(Boolean).join("\n");
  const withRef = prependReferenceToNotes(textParts, header.no_referensi);
  const withShip = buildNotesWithShipping(withRef, buildShippingFromHeader(header));
  if (!withShip?.trim()) return mpFeeNotes;
  if (!mpFeeNotes.trim()) return withShip;
  return `${withShip}\n\n${mpFeeNotes}`;
}

export function buildMpFeeNotesBlock(opts: {
  channelName: string;
  accountName: string;
  header: ImportOrderHeader;
  totalGross: number;
  totalFees: number;
  feeBreakdown: Record<string, number>;
}): string {
  return buildMarketplaceInvoiceNotes({
    channelName: opts.channelName,
    accountName: opts.accountName,
    mpOrderNo: opts.header.mp_order_no,
    mpBuyerName: opts.header.pembeli_mp,
    feeBreakdownJson: {
      mp_order_no: opts.header.mp_order_no,
      gross: opts.totalGross,
      fees: opts.feeBreakdown,
      total_fees: opts.totalFees,
      expected_net: opts.totalGross - opts.totalFees,
    },
  });
}

export function importHeaderSnapshot(header: ImportOrderHeader): string {
  return JSON.stringify({ import_header: header });
}

export function parseImportHeaderFromJson(raw?: string): ImportOrderHeader | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as { import_header?: ImportOrderHeader };
    return o.import_header ?? null;
  } catch {
    return null;
  }
}
