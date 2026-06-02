/**
 * Audit otomatis export XLSX — jalankan: node scripts/audit-xlsx-export.mjs
 * Memvalidasi struktur file, format, performa dataset besar, dan nama file.
 */
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "tmp", "xlsx-audit");

const XLSX_NUMFMT_IDR = '"Rp"#,##0';
const XLSX_NUMFMT_DATE = "dd/mm/yyyy";
const XLSX_NUMFMT_DATETIME = "dd/mm/yyyy hh:mm";

function sanitizeSheetName(name) {
  return name.replace(/[\\/*?:[\]]/g, "_").slice(0, 31);
}

/** Mirror lib/export/xlsx.ts — keep in sync for audit fidelity */
async function buildStyledXlsxBuffer(opts) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SERBA System";
  const ws = wb.addWorksheet(sanitizeSheetName(opts.sheetName));
  ws.columns = opts.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 14,
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.height = 22;

  for (const data of opts.rows) {
    const rowData = {};
    for (const col of opts.columns) {
      let v = data[col.key];
      if (col.type === "date" || col.type === "datetime") {
        v = v instanceof Date ? v : new Date(v);
      }
      rowData[col.key] = v;
    }
    ws.addRow(rowData);
  }

  const colCount = opts.columns.length;
  const rowCount = ws.rowCount;

  const fmt = {
    date: XLSX_NUMFMT_DATE,
    datetime: XLSX_NUMFMT_DATETIME,
    currency_idr: XLSX_NUMFMT_IDR,
    number: "#,##0",
    integer: "#,##0",
  };

  for (let r = 2; r <= rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      const type = opts.columns[c - 1]?.type;
      if (type && fmt[type]) row.getCell(c).numFmt = fmt[type];
    }
  }

  for (let c = 0; c < colCount; c++) {
    const colDef = opts.columns[c];
    let maxLen = colDef.header.length;
    ws.getColumn(c + 1).eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber === 1) return;
      maxLen = Math.max(maxLen, String(cell.value ?? "").length);
    });
    ws.getColumn(c + 1).width = Math.min(Math.max(maxLen + 2, colDef.width ?? 10), 52);
  }

  ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  if (rowCount > 1 && colCount > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rowCount, column: colCount },
    };
  }

  return wb.xlsx.writeBuffer();
}

function sanitizeFilename(name) {
  const base = String(name)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return base.toLowerCase().endsWith(".xlsx") ? base : `${base}.xlsx`;
}

function mockPayrollRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      period_key: "2026-05",
      period_status: "approved",
      employee_name: `Karyawan ${i + 1} — Divisi Operasional`,
      base_salary: 5_000_000 + i * 1000,
      net_amount: 4_800_000 + i * 900,
    });
  }
  return rows;
}

function mockInventoryRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      sku: `SKU-${String(i).padStart(6, "0")}`,
      product_name: `Produk contoh panjang nomor ${i}`,
      warehouse_code: "COSTA",
      qty_on_hand: 100 + (i % 500),
      qty_reserved: i % 20,
      qty_available: 80 + (i % 480),
    });
  }
  return rows;
}

function mockSalesRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      issue_date: new Date(2026, 0, 1 + (i % 28)),
      invoice_no: `INV-2026-${String(i).padStart(5, "0")}`,
      customer_name: `Pelanggan ${i}`,
      status_label: "Lunas",
      total: 1_250_000 + i * 5000,
    });
  }
  return rows;
}

const PAYROLL_COLS = [
  { header: "Periode", key: "period_key", width: 14, type: "text" },
  { header: "Status Periode", key: "period_status", width: 14, type: "text" },
  { header: "Nama Karyawan", key: "employee_name", width: 28, type: "text" },
  { header: "Gaji Pokok", key: "base_salary", width: 16, type: "currency_idr" },
  { header: "Bersih (Net)", key: "net_amount", width: 16, type: "currency_idr" },
];

const INV_COLS = [
  { header: "SKU", key: "sku", width: 16, type: "text" },
  { header: "Produk", key: "product_name", width: 32, type: "text" },
  { header: "Gudang", key: "warehouse_code", width: 12, type: "text" },
  { header: "Stok Fisik", key: "qty_on_hand", width: 14, type: "integer" },
  { header: "Reserved", key: "qty_reserved", width: 12, type: "integer" },
  { header: "Tersedia", key: "qty_available", width: 12, type: "integer" },
];

const SALES_COLS = [
  { header: "Tanggal", key: "issue_date", width: 14, type: "date" },
  { header: "No. Invoice", key: "invoice_no", width: 18, type: "text" },
  { header: "Pelanggan", key: "customer_name", width: 28, type: "text" },
  { header: "Status", key: "status_label", width: 14, type: "text" },
  { header: "Total", key: "total", width: 16, type: "currency_idr" },
];

async function validateWorkbook(buffer, expectations) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const issues = [];

  if (!ws) issues.push("Tidak ada worksheet");
  if (ws.name !== expectations.sheetName) {
    issues.push(`Sheet name: expected "${expectations.sheetName}", got "${ws.name}"`);
  }

  const h1 = ws.getRow(1);
  if (!h1.font?.bold) issues.push("Header baris 1 tidak bold");

  const frozen = ws.views?.some((v) => v.state === "frozen" && v.ySplit === 1);
  if (!frozen) issues.push("Freeze top row tidak aktif");

  if (!ws.autoFilter) issues.push("AutoFilter tidak diset");
  else {
    const af = ws.autoFilter;
    const range =
      typeof af === "string"
        ? af
        : af.from && af.to
          ? `${af.from.row}:${af.to.row}`
          : "";
    if (typeof af === "string" && !af.startsWith("A1:")) {
      issues.push(`AutoFilter range: ${af}`);
    }
    if (typeof af === "object" && af.from?.row !== 1) {
      issues.push("AutoFilter tidak mulai baris 1");
    }
    if (!range && typeof af !== "string") {
      issues.push("AutoFilter to.row tidak terbaca");
    }
  }

  if (ws.rowCount - 1 !== expectations.dataRows) {
    issues.push(`Baris data: expected ${expectations.dataRows}, got ${ws.rowCount - 1}`);
  }

  if (expectations.checkCurrencyCell) {
    const cell = ws.getCell(expectations.checkCurrencyCell);
    if (cell.numFmt !== XLSX_NUMFMT_IDR) {
      issues.push(`Format IDR: got "${cell.numFmt}"`);
    }
    if (typeof cell.value !== "number") {
      issues.push(`Nilai currency harus number, got ${typeof cell.value}`);
    }
  }

  if (expectations.checkDateCell) {
    const cell = ws.getCell(expectations.checkDateCell);
    if (cell.numFmt !== XLSX_NUMFMT_DATE) {
      issues.push(`Format date: got "${cell.numFmt}"`);
    }
    if (!(cell.value instanceof Date)) {
      issues.push(`Nilai date harus Date object, got ${typeof cell.value}`);
    }
  }

  for (const colIdx of expectations.minWidthCols ?? []) {
    const w = ws.getColumn(colIdx).width;
    const header = String(ws.getRow(1).getCell(colIdx).value ?? "");
    if (w < header.length) {
      issues.push(`Kolom ${colIdx} width ${w} < header length ${header.length}`);
    }
  }

  return issues;
}

const results = [];

async function runCase(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    const ms = Math.round(performance.now() - t0);
    results.push({ name, status: "PASS", ms, ...detail });
  } catch (e) {
    results.push({
      name,
      status: "FAIL",
      ms: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

await runCase("Payroll 1001 baris — struktur & format", async () => {
  const rows = mockPayrollRows(1001);
  const buf = await buildStyledXlsxBuffer({
    sheetName: "Payroll",
    columns: PAYROLL_COLS,
    rows,
  });
  const path = join(OUT_DIR, "audit-payroll-1001.xlsx");
  writeFileSync(path, Buffer.from(buf));
  const issues = await validateWorkbook(buf, {
    sheetName: "Payroll",
    dataRows: 1001,
    checkCurrencyCell: "D2",
    minWidthCols: [1, 2, 3],
  });
  if (issues.length) throw new Error(issues.join("; "));
  return { file: path, sizeKb: Math.round(buf.byteLength / 1024) };
});

await runCase("Inventory 5000 baris — struktur", async () => {
  const rows = mockInventoryRows(5000);
  const buf = await buildStyledXlsxBuffer({
    sheetName: "Inventory",
    columns: INV_COLS,
    rows,
  });
  const path = join(OUT_DIR, "audit-inventory-5000.xlsx");
  writeFileSync(path, Buffer.from(buf));
  const issues = await validateWorkbook(buf, {
    sheetName: "Inventory",
    dataRows: 5000,
    checkCurrencyCell: null,
    minWidthCols: [1, 2],
  });
  if (issues.length) throw new Error(issues.join("; "));
  return { file: path, sizeKb: Math.round(buf.byteLength / 1024) };
});

await runCase("Penjualan 3000 invoice — tanggal & IDR", async () => {
  const rows = mockSalesRows(3000);
  const buf = await buildStyledXlsxBuffer({
    sheetName: "Penjualan",
    columns: SALES_COLS,
    rows,
  });
  const path = join(OUT_DIR, "audit-penjualan-3000.xlsx");
  writeFileSync(path, Buffer.from(buf));
  const issues = await validateWorkbook(buf, {
    sheetName: "Penjualan",
    dataRows: 3000,
    checkCurrencyCell: "E2",
    checkDateCell: "A2",
    minWidthCols: [1, 2, 4],
  });
  if (issues.length) throw new Error(issues.join("; "));
  return { file: path, sizeKb: Math.round(buf.byteLength / 1024) };
});

await runCase("Nama file — karakter ilegal", () => {
  const raw = 'payroll/2026:05<>|?*".xlsx';
  const safe = sanitizeFilename(raw);
  if (/[<>:"/\\|?*]/.test(safe)) throw new Error(`Masih ada char ilegal: ${safe}`);
  if (!safe.endsWith(".xlsx")) throw new Error("Ekstensi hilang");
  return { input: raw, output: safe };
});

/** Simulasi: production pakai sanitizeExportFilename di downloadXlsxFile */
await runCase("Nama file production — sanitizeExportFilename", () => {
  const periodKey = "2026/05";
  const safe = sanitizeFilename(`payroll-${periodKey}.xlsx`);
  if (/[<>:"/\\|?*]/.test(safe)) throw new Error(`Masih ilegal: ${safe}`);
  return { sample: `payroll-${periodKey}.xlsx`, output: safe };
});

const THRESHOLD_MS = 30_000;
for (const r of results) {
  if (r.status === "PASS" && r.ms > THRESHOLD_MS) {
    r.status = "WARN";
    r.warn = `Build > ${THRESHOLD_MS / 1000}s — risiko freeze browser`;
  }
}

console.log("\n=== AUDIT XLSX EXPORT ===\n");
for (const r of results) {
  console.log(`[${r.status}] ${r.name} (${r.ms}ms)`);
  if (r.file) console.log(`       file: ${r.file} (${r.sizeKb} KB)`);
  if (r.error) console.log(`       error: ${r.error}`);
  if (r.warn) console.log(`       warn: ${r.warn}`);
  if (r.note) console.log(`       note: ${r.note}`);
  if (r.output) console.log(`       ${r.input} → ${r.output}`);
}
console.log("\nFile sampel di tmp/xlsx-audit/ — buka manual di Excel / Sheets / LibreOffice.\n");

const failed = results.filter((r) => r.status === "FAIL").length;
const warned = results.filter((r) => r.status === "WARN").length;
process.exit(failed > 0 ? 1 : 0);
