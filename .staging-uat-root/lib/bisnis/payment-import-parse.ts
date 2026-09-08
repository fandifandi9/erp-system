import * as XLSX from "xlsx";
import {
  PAYMENT_IMPORT_COLUMN_ALIASES,
  PAYMENT_IMPORT_TEMPLATE_COLUMNS,
  type ParsedPaymentImportRow,
} from "./payment-import-schema";

export type { ParsedPaymentImportRow } from "./payment-import-schema";

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/\*+/g, "")
    .replace(/_+/g, "_");
}

function findColumnKey(headers: string[], field: keyof typeof PAYMENT_IMPORT_COLUMN_ALIASES): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of PAYMENT_IMPORT_COLUMN_ALIASES[field]) {
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
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function parseYesNo(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "y" || s === "yes" || s === "ya" || s === "1" || s === "true" || s === "t";
}

export function parsePaymentImportFile(buffer: ArrayBuffer): ParsedPaymentImportRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("File Excel kosong");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) throw new Error("Minimal 1 baris data + header");

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
  const col: Record<string, number> = {};
  for (const key of Object.keys(PAYMENT_IMPORT_COLUMN_ALIASES) as (keyof typeof PAYMENT_IMPORT_COLUMN_ALIASES)[]) {
    col[key] = findColumnKey(headers, key);
  }

  if (col.invoice_no < 0) throw new Error("Kolom no_invoice (*) tidak ditemukan — unduh template terbaru");
  if (col.payment_date < 0) throw new Error("Kolom tgl_pembayaran (*) tidak ditemukan");
  if (col.amount < 0) throw new Error("Kolom jumlah (*) tidak ditemukan");
  if (col.payment_method < 0) throw new Error("Kolom metode_bayar (*) tidak ditemukan");

  const out: ParsedPaymentImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const invoice_no = cellStr(row, col.invoice_no);
    if (!invoice_no) continue;

    const lunas_penuh = col.lunas_penuh >= 0 ? parseYesNo(cellStr(row, col.lunas_penuh)) : false;
    const amount = cellNum(row, col.amount);

    out.push({
      rowNo: i + 1,
      invoice_no,
      payment_date: parseExcelDate(col.payment_date >= 0 ? row[col.payment_date] : undefined),
      amount,
      payment_method: col.payment_method >= 0 ? cellStr(row, col.payment_method) : "",
      reference_no: col.reference_no >= 0 ? cellStr(row, col.reference_no) : undefined,
      notes: col.notes >= 0 ? cellStr(row, col.notes) : undefined,
      lunas_penuh,
    });
  }

  if (out.length === 0) throw new Error("Tidak ada baris valid dalam file");
  return out;
}

export const PAYMENT_IMPORT_TEMPLATE_HEADERS = PAYMENT_IMPORT_TEMPLATE_COLUMNS.map((c) => c.header);
