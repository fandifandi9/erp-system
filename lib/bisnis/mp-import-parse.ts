import * as XLSX from "xlsx";
import type { SalesImportLine } from "./types";

/** Baris mentah dari Excel sebelum disimpan ke PB. */
export type ParsedImportRow = {
  rowNo: number;
  mp_order_no: string;
  order_date: string;
  mp_buyer_name?: string;
  mp_sku: string;
  product_name?: string;
  mp_category?: string;
  qty: number;
  unit_price: number;
  gross_amount: number;
};

const HEADER_ALIASES: Record<string, string[]> = {
  mp_order_no: ["mp_order_no", "no_pesanan", "order_no", "nomor_pesanan", "no order", "order id"],
  mp_buyer_name: [
    "mp_buyer_name",
    "buyer_name",
    "nama_pembeli",
    "nama pembeli",
    "penerima",
    "nama_penerima",
    "customer_name",
  ],
  order_date: ["order_date", "tanggal", "tgl_order", "tgl pesanan", "date"],
  mp_sku: ["mp_sku", "sku", "kode_produk", "seller_sku", "sku penjual"],
  product_name: ["product_name", "nama_produk", "nama produk", "product"],
  mp_category: ["mp_category", "kategori", "category", "kategori_mp"],
  qty: ["qty", "quantity", "jumlah", "qty_produk"],
  unit_price: ["unit_price", "harga", "harga_jual", "price", "harga satuan"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function findColumnKey(headers: string[], field: keyof typeof HEADER_ALIASES): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of HEADER_ALIASES[field]) {
    const idx = normalized.indexOf(alias);
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

export function parseSalesImportFile(buffer: ArrayBuffer): ParsedImportRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("File Excel kosong");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) throw new Error("Minimal 1 baris data + header");

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
  const col = {
    order: findColumnKey(headers, "mp_order_no"),
    buyer: findColumnKey(headers, "mp_buyer_name"),
    date: findColumnKey(headers, "order_date"),
    sku: findColumnKey(headers, "mp_sku"),
    name: findColumnKey(headers, "product_name"),
    category: findColumnKey(headers, "mp_category"),
    qty: findColumnKey(headers, "qty"),
    price: findColumnKey(headers, "unit_price"),
  };

  if (col.order < 0) throw new Error("Kolom mp_order_no / no_pesanan tidak ditemukan");
  if (col.sku < 0) throw new Error("Kolom mp_sku / sku tidak ditemukan");
  if (col.qty < 0) throw new Error("Kolom qty / jumlah tidak ditemukan");

  const out: ParsedImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const mp_order_no = cellStr(row, col.order);
    const mp_sku = cellStr(row, col.sku);
    if (!mp_order_no || !mp_sku) continue;

    const qty = Math.max(1, Math.round(cellNum(row, col.qty) || 1));
    const unit_price = cellNum(row, col.price);
    const gross_amount = unit_price > 0 ? Math.round(unit_price * qty) : cellNum(row, col.price);

    out.push({
      rowNo: i + 1,
      mp_order_no,
      order_date: parseExcelDate(col.date >= 0 ? row[col.date] : undefined),
      mp_buyer_name: col.buyer >= 0 ? cellStr(row, col.buyer) : undefined,
      mp_sku,
      product_name: col.name >= 0 ? cellStr(row, col.name) : undefined,
      mp_category: col.category >= 0 ? cellStr(row, col.category) : undefined,
      qty,
      unit_price: unit_price || (qty > 0 ? Math.round(gross_amount / qty) : 0),
      gross_amount: gross_amount || Math.round(unit_price * qty),
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
  return {
    batch: batchId,
    row_no: row.rowNo,
    mp_order_no: row.mp_order_no,
    order_date: row.order_date,
    mp_buyer_name: row.mp_buyer_name,
    mp_sku: row.mp_sku,
    product_name: row.product_name,
    mp_category: row.mp_category,
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

/** Template XLSX untuk download (sheet Penjualan). CSV legacy: {@link importTemplateCsv}. */
export const IMPORT_TEMPLATE_HEADERS = [
  "mp_order_no",
  "order_date",
  "mp_buyer_name",
  "mp_sku",
  "product_name",
  "mp_category",
  "qty",
  "unit_price",
] as const;

export function importTemplateCsv(): string {
  const note =
    "# mp_sku = Kode produk/SKU di master SERBA (sama di Shopee, Tokopedia, BliBli). mp_category opsional (diabaikan jika SKU dikenali).";
  const sample = [
    ["ORD-20260528-001", "28/05/2026", "Budi Santoso", "22344FGG56666", "COSTA CT-6218 Tripod", "", "2", "250000"],
    ["ORD-20260528-002", "28/05/2026", "Siti Aminah", "22344FGG56666", "COSTA CT-6218 Tripod", "", "1", "250000"],
  ];
  return [note, IMPORT_TEMPLATE_HEADERS.join(","), ...sample.map((r) => r.join(","))].join("\n");
}
