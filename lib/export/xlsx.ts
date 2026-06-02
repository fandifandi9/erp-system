import ExcelJS from "exceljs";

/** Nama sheet standar per modul ERP. */
export type ExcelModuleSheet = "Payroll" | "Penjualan" | "Pembelian" | "Inventory" | "Absensi";

export const XLSX_NUMFMT_IDR = '"Rp"#,##0';
export const XLSX_NUMFMT_NUMBER = "#,##0";
export const XLSX_NUMFMT_DECIMAL = "#,##0.##";
export const XLSX_NUMFMT_DATE = "dd/mm/yyyy";
export const XLSX_NUMFMT_DATETIME = "dd/mm/yyyy hh:mm";

export type XlsxColumnType =
  | "text"
  | "date"
  | "datetime"
  | "currency_idr"
  | "number"
  | "integer";

export type XlsxColumnDef<T extends string = string> = {
  header: string;
  key: T;
  width?: number;
  type?: XlsxColumnType;
};

export type BuildStyledXlsxOptions<T extends string> = {
  sheetName: ExcelModuleSheet | string;
  columns: XlsxColumnDef<T>[];
  rows: Array<Record<T, unknown>>;
};

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, "_").slice(0, 31);
}

/** Aman untuk Windows, macOS, iOS, Android — hindari path/reserved chars. */
export function sanitizeExportFilename(name: string): string {
  const trimmed = String(name).trim();
  const withExt = trimmed.toLowerCase().endsWith(".xlsx") ? trimmed : `${trimmed}.xlsx`;
  const base = withExt.slice(0, -5);
  const safe = base
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return `${safe || "export"}.xlsx`;
}

function parseExcelDate(v: unknown): Date | string | number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d;
}

function applyCellFormat(cell: ExcelJS.Cell, type?: XlsxColumnType): void {
  if (!type || type === "text") return;
  switch (type) {
    case "date":
      cell.numFmt = XLSX_NUMFMT_DATE;
      break;
    case "datetime":
      cell.numFmt = XLSX_NUMFMT_DATETIME;
      break;
    case "currency_idr":
      cell.numFmt = XLSX_NUMFMT_IDR;
      cell.alignment = { horizontal: "right" };
      break;
    case "number":
      cell.numFmt = XLSX_NUMFMT_NUMBER;
      cell.alignment = { horizontal: "right" };
      break;
    case "integer":
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
      break;
  }
}

function coerceCellValue(v: unknown, type?: XlsxColumnType): unknown {
  if (v == null || v === "") return null;
  if (type === "date" || type === "datetime") return parseExcelDate(v);
  if (type === "currency_idr" || type === "number" || type === "integer") {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return v;
}

/**
 * Bangun file XLSX dengan header bold, freeze baris 1, autofilter, lebar kolom otomatis,
 * serta format tanggal / Rupiah / pemisah ribuan.
 */
export async function buildStyledXlsxBuffer<T extends string>(
  opts: BuildStyledXlsxOptions<T>
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SERBA System";
  wb.created = new Date();

  const ws = wb.addWorksheet(sanitizeSheetName(opts.sheetName));
  ws.columns = opts.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 14,
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FF1E293B" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  for (const data of opts.rows) {
    const rowData: Record<string, unknown> = {};
    for (const col of opts.columns) {
      rowData[col.key] = coerceCellValue(data[col.key], col.type);
    }
    ws.addRow(rowData);
  }

  const colCount = opts.columns.length;
  const rowCount = ws.rowCount;

  for (let r = 2; r <= rowCount; r++) {
    const row = ws.getRow(r);
    if (r % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
    }
    for (let c = 1; c <= colCount; c++) {
      applyCellFormat(row.getCell(c), opts.columns[c - 1]?.type);
    }
  }

  for (let c = 0; c < colCount; c++) {
    const colDef = opts.columns[c];
    let maxLen = colDef.header.length;
    const column = ws.getColumn(c + 1);
    column.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber === 1) return;
      const text =
        cell.value instanceof Date
          ? cell.value.toLocaleDateString("id-ID")
          : String(cell.value ?? "");
      maxLen = Math.max(maxLen, text.length);
    });
    column.width = Math.min(Math.max(maxLen + 2, colDef.width ?? 10), 52);
  }

  ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  if (rowCount > 1 && colCount > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rowCount, column: colCount },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function downloadXlsxFile(buffer: ArrayBuffer, filename: string): void {
  const name = sanitizeExportFilename(filename);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function buildAndDownloadXlsx<T extends string>(
  opts: BuildStyledXlsxOptions<T> & { filename: string }
): Promise<void> {
  const buffer = await buildStyledXlsxBuffer(opts);
  downloadXlsxFile(buffer, opts.filename);
}
