import * as XLSX from "xlsx";
import type { SalesImportLine } from "./types";
import {
  IMPORT_COLUMN_ALIASES,
  IMPORT_TEMPLATE_COLUMNS,
  IMPORT_TEMPLATE_HEADER_KEYS,
  type ImportOrderHeader,
  type ParsedImportRow,
  parseDiscountType,
  parseYesNo,
} from "./mp-import-schema";

export type { ParsedImportRow, ImportOrderHeader } from "./mp-import-schema";

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/\*+/g, "")
    .replace(/_+/g, "_");
}

function findColumnKey(headers: string[], field: keyof typeof IMPORT_COLUMN_ALIASES): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of IMPORT_COLUMN_ALIASES[field]) {
    const idx = normalized.indexOf(normalizeHeader(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function cellStr(row: unknown[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  if (v == null) return "";
  return String(v).trim();
}

function cellNum(row: unknown[], idx: number): number {
  const s = cellStr(row, idx).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseExcelDate(v: unknown): string {
  if (v == null || v === "") return new Date().toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function buildHeader(row: unknown[], col: Record<string, number>): ImportOrderHeader {
  return {
    toko: cellStr(row, col.toko),
    pelanggan: cellStr(row, col.pelanggan),
    email: cellStr(row, col.email) || undefined,
    no_so: cellStr(row, col.no_so) || undefined,
    no_referensi: cellStr(row, col.no_referensi) || undefined,
    tgl_transaksi: parseExcelDate(col.tgl_transaksi >= 0 ? row[col.tgl_transaksi] : undefined),
    jatuh_tempo: col.jatuh_tempo >= 0 && cellStr(row, col.jatuh_tempo)
      ? parseExcelDate(row[col.jatuh_tempo])
      : undefined,
    term: cellStr(row, col.term) || undefined,
    metode_bayar: cellStr(row, col.metode_bayar) || undefined,
    lewat_wms: col.lewat_wms >= 0 ? parseYesNo(cellStr(row, col.lewat_wms)) : false,
    pesan: cellStr(row, col.pesan) || undefined,
    memo: cellStr(row, col.memo) || undefined,
    harga_termasuk_ppn:
      col.harga_termasuk_ppn >= 0 ? parseYesNo(cellStr(row, col.harga_termasuk_ppn)) : false,
    ppn_persen: col.ppn_persen >= 0 ? cellNum(row, col.ppn_persen) : 0,
    diskon_order: col.diskon_order >= 0 ? cellNum(row, col.diskon_order) : 0,
    diskon_order_tipe:
      col.diskon_order_tipe >= 0
        ? parseDiscountType(cellStr(row, col.diskon_order_tipe))
        : "persen",
    materai: col.materai >= 0 ? cellNum(row, col.materai) : 0,
    mp_order_no: cellStr(row, col.mp_order_no),
    pembeli_mp: cellStr(row, col.pembeli_mp) || undefined,
    ekspedisi: cellStr(row, col.ekspedisi) || undefined,
    no_resi: cellStr(row, col.no_resi) || undefined,
    ongkir: col.ongkir >= 0 ? cellNum(row, col.ongkir) : 0,
    alamat_kirim: cellStr(row, col.alamat_kirim) || undefined,
  };
}

export function parseSalesImportFile(buffer: ArrayBuffer): ParsedImportRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("File Excel kosong");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) throw new Error("Minimal 1 baris data + header");

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
  const col: Record<string, number> = {};
  for (const key of Object.keys(IMPORT_COLUMN_ALIASES) as (keyof typeof IMPORT_COLUMN_ALIASES)[]) {
    col[key] = findColumnKey(headers, key);
  }

  if (col.toko < 0) throw new Error('Kolom toko (*) tidak ditemukan — unduh template Excel terbaru');
  if (col.pelanggan < 0) throw new Error('Kolom pelanggan (*) tidak ditemukan');
  if (col.tgl_transaksi < 0 && col.mp_order_no < 0) {
    throw new Error("Kolom tgl_transaksi (*) atau order_date wajib ada");
  }
  if (col.mp_order_no < 0) throw new Error("Kolom mp_order_no (*) tidak ditemukan");
  if (col.mp_sku < 0) throw new Error("Kolom mp_sku (*) tidak ditemukan");
  if (col.qty < 0) throw new Error("Kolom qty (*) tidak ditemukan");
  if (col.harga_satuan < 0) throw new Error("Kolom harga_satuan (*) tidak ditemukan");

  const out: ParsedImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const header = buildHeader(row, col);
    const mp_sku = cellStr(row, col.mp_sku);
    if (!header.mp_order_no || !mp_sku) continue;

    const qty = Math.max(1, Math.round(cellNum(row, col.qty) || 1));
    const unit_price = cellNum(row, col.harga_satuan);
    const discount_percent = col.diskon_baris_pct >= 0 ? cellNum(row, col.diskon_baris_pct) : 0;
    const gross = Math.round(qty * unit_price * (1 - discount_percent / 100));

    out.push({
      rowNo: i + 1,
      header,
      mp_sku,
      product_name: col.nama_produk >= 0 ? cellStr(row, col.nama_produk) : undefined,
      catatan_baris: col.catatan_baris >= 0 ? cellStr(row, col.catatan_baris) : undefined,
      qty,
      unit: col.unit >= 0 ? cellStr(row, col.unit) || "pcs" : "pcs",
      unit_price,
      discount_percent,
      gross_amount: gross || Math.round(unit_price * qty),
    });
  }

  if (out.length === 0) throw new Error("Tidak ada baris valid dalam file");
  return out;
}

export function buildImportLinePayload(
  batchId: string,
  row: ParsedImportRow,
  fees: {
    product?: string;
    fee_category: number;
    fee_free_shipping: number;
    fee_cashback: number;
    fee_mall: number;
    fee_processing: number;
    fee_affiliate: number;
    total_fees: number;
    expected_net: number;
    fee_override_json?: string;
    validation_status: SalesImportLine["validation_status"];
    error_message?: string;
  },
): Partial<SalesImportLine> {
  const h = row.header;
  return {
    batch: batchId,
    row_no: row.rowNo,
    mp_order_no: h.mp_order_no,
    order_date: h.tgl_transaksi,
    mp_buyer_name: h.pembeli_mp,
    mp_sku: row.mp_sku,
    product_name: row.product_name,
    qty: row.qty,
    unit_price: row.unit_price,
    gross_amount: row.gross_amount,
    product: fees.product,
    fee_category: fees.fee_category,
    fee_free_shipping: fees.fee_free_shipping,
    fee_cashback: fees.fee_cashback,
    fee_mall: fees.fee_mall,
    fee_processing: fees.fee_processing,
    fee_affiliate: fees.fee_affiliate,
    total_fees: fees.total_fees,
    expected_net: fees.expected_net,
    fee_override_json: fees.fee_override_json,
    validation_status: fees.validation_status,
    error_message: fees.error_message,
  };
}

export const IMPORT_TEMPLATE_HEADERS = IMPORT_TEMPLATE_HEADER_KEYS;

export function importTemplateCsv(): string {
  const note =
    "# Template import penjualan SERBA — kolom (*) wajib. Pelanggan harus ada di master Kontak.";
  const headers = IMPORT_TEMPLATE_COLUMNS.map((c) => c.header).join(",");
  return [note, headers].join("\n");
}
