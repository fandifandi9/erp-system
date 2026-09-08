import type PocketBase from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "./types";

async function resolveDocPb(): Promise<PocketBase> {
  if (typeof window !== "undefined") return pb;
  const { getInventoryAdminPb } = await import("@/lib/inventory/pb-server");
  return getInventoryAdminPb();
}

export type NumberingConfig = {
  collection: string;
  field: string;
  prefix: string;
};

/** Konfigurasi nomor urut per jenis dokumen (masing-masing sequence terpisah). */
export const BIZ_DOC_NUMBER_CONFIG = {
  po: {
    collection: BISNIS_COLLECTIONS.purchaseOrders,
    field: "po_no",
    prefix: "PO",
  },
  bill: {
    collection: BISNIS_COLLECTIONS.purchaseBills,
    field: "bill_no",
    prefix: "BILL",
  },
  so: {
    collection: BISNIS_COLLECTIONS.salesOrders,
    field: "order_no",
    prefix: "SO",
  },
  inv: {
    collection: BISNIS_COLLECTIONS.invoices,
    field: "invoice_no",
    prefix: "INV",
  },
  exp: {
    collection: BISNIS_COLLECTIONS.expenses,
    field: "expense_no",
    prefix: "EXP",
  },
  ret: {
    collection: BISNIS_COLLECTIONS.returs,
    field: "retur_no",
    prefix: "RET",
  },
  cn: {
    collection: BISNIS_COLLECTIONS.creditNotes,
    field: "cn_no",
    prefix: "CN",
  },
  imp: {
    collection: BISNIS_COLLECTIONS.salesImportBatches,
    field: "batch_no",
    prefix: "IMP",
  },
  payImp: {
    collection: BISNIS_COLLECTIONS.paymentImportBatches,
    field: "batch_no",
    prefix: "PEL",
  },
} as const satisfies Record<string, NumberingConfig>;

export type BizDocNumberKind = keyof typeof BIZ_DOC_NUMBER_CONFIG;

/** Urutan 0001–9999, wrap ke 0001 setelah 9999 (bukan reset per hari/bulan). */
export const DOC_SEQ_MAX = 9999;
const DOC_SEQ_PAD = 4;

/** Urutan lebar RET/TT: 00001–99999, wrap ke 00001 setelah 99999. */
export const DOC_SEQ_MAX_WIDE = 99999;
const DOC_SEQ_PAD_WIDE = 5;

/** Prefix yang memakai urutan 5 digit. */
const WIDE_SEQ_PREFIXES = new Set(["RET", "TT"]);

export function usesWideDocSeq(prefix: string): boolean {
  return WIDE_SEQ_PREFIXES.has(prefix.trim().toUpperCase());
}

function seqMaxForPrefix(prefix: string): number {
  return usesWideDocSeq(prefix) ? DOC_SEQ_MAX_WIDE : DOC_SEQ_MAX;
}

function seqPadForPrefix(prefix: string): number {
  return usesWideDocSeq(prefix) ? DOC_SEQ_PAD_WIDE : DOC_SEQ_PAD;
}

/** Legacy bulanan: 00001–99999. */
const LEGACY_SEQ_MAX = 99999;
const LEGACY_SEQ_PAD = 5;

export type DocNumberOpts = { periodDate?: string | Date };

function escapeFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function resolveDate(date: string | Date = new Date()): Date {
  const d = typeof date === "string" ? new Date(date.includes("T") ? date : `${date}T12:00:00`) : date;
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

/** Stempel tanggal DDMMYY, contoh 9 Jul 2026 → 090726. */
export function docDateStamp(date: string | Date = new Date()): string {
  const d = resolveDate(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

/**
 * @deprecated Gunakan docDateStamp (DDMMYY). Tetap diekspor untuk kompatibilitas;
 * sekarang mengembalikan DDMMYY (bukan MMYYYY).
 */
export function docPeriodKey(date: string | Date = new Date()): string {
  return docDateStamp(date);
}

/**
 * Format standar:
 * - Umum: PREFIXDDMMYY-0001 (contoh INV090726-0012)
 * - RET/TT (internal): PREFIX00001 — 5 digit saja, tanpa tanggal (wrap setelah 99999)
 */
export function formatDocNo(prefix: string, seq: number, dateStamp: string): string {
  const max = seqMaxForPrefix(prefix);
  const pad = seqPadForPrefix(prefix);
  const clamped = ((seq - 1) % max) + 1;
  const body = String(clamped).padStart(pad, "0");
  if (usesWideDocSeq(prefix)) {
    return `${prefix}${body}`;
  }
  return `${prefix}${dateStamp}-${body}`;
}

function formatLegacyMonthlyDocNo(prefix: string, seq: number, periodKey: string): string {
  const clamped = ((seq - 1) % LEGACY_SEQ_MAX) + 1;
  return `${prefix}-${periodKey}-${String(clamped).padStart(LEGACY_SEQ_PAD, "0")}`;
}

export function docNoPattern(prefix: string) {
  return {
    /** RET/TT internal: RET00001 / TT00012 */
    internalWide: new RegExp(`^${prefix}(\\d{5})$`),
    /** Current dated: INV090726-0012 atau legacy RET/TT DDMMYY-00001 */
    current: new RegExp(`^${prefix}(\\d{6})-(\\d{4,5})$`),
    /** Legacy monthly: INV-072026-00001 */
    monthly: new RegExp(`^${prefix}-(\\d{6})-(\\d{5})$`),
    /** Legacy: SO-0001 */
    global: new RegExp(`^${prefix}-(\\d{4})$`),
    /** Legacy: SO-20260531-0001 */
    dated: new RegExp(`^${prefix}-\\d{8}-(\\d+)$`),
  };
}

export type DocNoParts = {
  dateStamp: string;
  seq: number;
  style: "internal-wide" | "current" | "legacy-monthly" | "legacy-other";
};

export function parseDocNoParts(value: string, prefix: string): DocNoParts | null {
  const trimmed = value.trim();
  const { internalWide, current, monthly, global, dated } = docNoPattern(prefix);

  const iw = trimmed.match(internalWide);
  if (iw) {
    const n = Number(iw[1]);
    if (n >= 1 && n <= DOC_SEQ_MAX_WIDE) {
      return { dateStamp: "", seq: n, style: "internal-wide" };
    }
  }

  const c = trimmed.match(current);
  if (c) {
    const n = Number(c[2]);
    const max = seqMaxForPrefix(prefix);
    // Terima format lama 4 digit maupun lebar 5 digit.
    if (n >= 1 && n <= Math.max(max, DOC_SEQ_MAX)) {
      return { dateStamp: c[1], seq: n, style: "current" };
    }
  }

  const m = trimmed.match(monthly);
  if (m) {
    const n = Number(m[2]);
    if (n >= 1 && n <= LEGACY_SEQ_MAX) {
      return { dateStamp: m[1], seq: n, style: "legacy-monthly" };
    }
  }

  const g = trimmed.match(global);
  if (g) {
    const n = Number(g[1]);
    if (n >= 1 && n <= DOC_SEQ_MAX) {
      return { dateStamp: docDateStamp(new Date()), seq: n, style: "legacy-other" };
    }
  }

  const d = trimmed.match(dated);
  if (d) {
    const n = Number(d[1]);
    if (Number.isFinite(n) && n >= 1) {
      return {
        dateStamp: docDateStamp(new Date()),
        seq: Math.min(n, DOC_SEQ_MAX),
        style: "legacy-other",
      };
    }
  }

  return null;
}

export function parseDocNoSeq(
  value: string,
  prefix: string,
  dateStamp?: string,
): number | null {
  const parts = parseDocNoParts(value, prefix);
  if (!parts) return null;
  if (dateStamp && parts.dateStamp !== dateStamp) return null;
  if (parts.style !== "current" && dateStamp) return null;
  return parts.seq;
}

/** True jika nomor mengikuti pola auto (format baru atau legacy). */
export function isAutoGeneratedDocNo(
  value: string,
  prefix: string,
  periodDate?: string | Date,
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parts = parseDocNoParts(trimmed, prefix);
  if (!parts) return false;
  if (periodDate) {
    if (parts.style === "current") {
      return parts.dateStamp === docDateStamp(periodDate);
    }
    // Legacy: anggap auto jika pola valid (tidak dipaksa cocok tanggal baru).
    return true;
  }
  return true;
}

export function docNumberFormatHint(prefix: string): string {
  const stamp = docDateStamp(new Date());
  if (usesWideDocSeq(prefix)) {
    return `Format internal ${prefix}00001 … ${prefix}99999 (urutan lanjut, reset setelah 99999). Tanggal transaksi terpisah di dokumen.`;
  }
  return `Format ${prefix}${stamp}-0001 … ${prefix}${stamp}-9999 (urutan lanjut, reset setelah 9999).`;
}

function nextSeqAfter(max: number, maxCap: number): number {
  if (max >= maxCap) return 1;
  return max + 1;
}

/** Cari urutan tertinggi (RET/TT internal 5 digit, atau format bertanggal lain). */
async function findMaxSeq(config: NumberingConfig): Promise<number> {
  let max = 0;
  const maxCap = seqMaxForPrefix(config.prefix);
  try {
    const docPb = await resolveDocPb();
    const rows = await docPb.collection(config.collection).getFullList<Record<string, unknown>>({
      filter: `${config.field} ~ "${escapeFilter(config.prefix)}"`,
      fields: config.field,
      requestKey: null,
    });
    for (const row of rows) {
      const val = row[config.field];
      if (typeof val !== "string") continue;
      const parts = parseDocNoParts(val, config.prefix);
      if (!parts) continue;
      if (parts.seq >= 1 && parts.seq <= Math.max(maxCap, DOC_SEQ_MAX)) {
        max = Math.max(max, parts.seq);
      }
    }
  } catch {
    return 0;
  }
  return max;
}

/** Nomor urut berikutnya — wrap setelah batas (bukan reset harian/bulanan). */
export async function nextDocNo(
  config: NumberingConfig,
  opts?: DocNumberOpts,
): Promise<string> {
  const dateStamp = docDateStamp(opts?.periodDate ?? new Date());
  const maxCap = seqMaxForPrefix(config.prefix);
  const max = await findMaxSeq(config);
  let candidate = nextSeqAfter(max, maxCap);

  for (let attempt = 0; attempt < maxCap; attempt++) {
    const docNo = formatDocNo(config.prefix, candidate, dateStamp);
    if (!(await isDocNoTaken(config, docNo))) return docNo;
    candidate = nextSeqAfter(candidate, maxCap);
  }

  const pad = seqPadForPrefix(config.prefix);
  const lo = "0".repeat(pad - 1) + "1";
  const hi = "9".repeat(pad);
  if (usesWideDocSeq(config.prefix)) {
    throw new Error(`Semua nomor ${config.prefix}${lo} s/d ${config.prefix}${hi} sudah dipakai.`);
  }
  throw new Error(
    `Semua nomor ${config.prefix}******-${lo} s/d ${config.prefix}******-${hi} sudah dipakai.`,
  );
}

export async function nextDocNoFor(
  kind: BizDocNumberKind,
  opts?: DocNumberOpts,
): Promise<string> {
  return nextDocNo(BIZ_DOC_NUMBER_CONFIG[kind], opts);
}

export async function isDocNoTaken(
  config: NumberingConfig,
  docNo: string,
  excludeId?: string,
): Promise<boolean> {
  const trimmed = docNo.trim();
  if (!trimmed) return false;
  let filter = `${config.field} = "${escapeFilter(trimmed)}"`;
  if (excludeId) filter += ` && id != "${escapeFilter(excludeId)}"`;
  try {
    const docPb = await resolveDocPb();
    const list = await docPb.collection(config.collection).getList(1, 1, {
      filter,
      requestKey: null,
    });
    return list.totalItems > 0;
  } catch {
    return false;
  }
}

export async function assertDocNoAvailable(
  config: NumberingConfig,
  docNo: string,
  excludeId?: string,
): Promise<void> {
  if (await isDocNoTaken(config, docNo, excludeId)) {
    throw new Error(`Nomor ${docNo.trim()} sudah dipakai. Pilih nomor lain.`);
  }
}

/**
 * Ubah prefix dokumen — stempel tanggal & urutan tetap
 * (SO090726-0012 → INV090726-0012; legacy SO-062026-00019 → INV-062026-00019).
 */
export function pairedDocNo(value: string, targetPrefix: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const prefix of [BIZ_DOC_NUMBER_CONFIG.so.prefix, BIZ_DOC_NUMBER_CONFIG.inv.prefix]) {
    const parts = parseDocNoParts(trimmed, prefix);
    if (!parts) continue;
    if (parts.style === "current") {
      return formatDocNo(targetPrefix, parts.seq, parts.dateStamp);
    }
    if (parts.style === "legacy-monthly") {
      return formatLegacyMonthlyDocNo(targetPrefix, parts.seq, parts.dateStamp);
    }
  }
  return null;
}

export function invoiceNoFromSalesOrder(orderNo: string): string | null {
  return pairedDocNo(orderNo, BIZ_DOC_NUMBER_CONFIG.inv.prefix);
}

export function salesOrderNoFromInvoice(invoiceNo: string): string | null {
  return pairedDocNo(invoiceNo, BIZ_DOC_NUMBER_CONFIG.so.prefix);
}

/**
 * Nomor invoice dari SO — urutan sama, hanya prefix INV.
 * Nomor SO eksternal (bukan format auto) → nomor invoice baru terpisah.
 */
export async function resolveInvoiceNoForSalesOrder(
  orderNo: string,
  opts?: { periodDate?: string | Date },
): Promise<string> {
  const paired = invoiceNoFromSalesOrder(orderNo);
  if (paired) {
    if (await isDocNoTaken(BIZ_DOC_NUMBER_CONFIG.inv, paired)) {
      throw new Error(`Nomor invoice pasangan ${paired} sudah dipakai.`);
    }
    return paired;
  }
  return nextDocNo(BIZ_DOC_NUMBER_CONFIG.inv, { periodDate: opts?.periodDate });
}
