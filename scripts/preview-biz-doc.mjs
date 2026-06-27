// Preview harness: transpile doc-print TS modules dan render sample dokumen ke HTML.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = process.cwd();
const tmp = path.join(root, ".tmp-doc-preview");
fs.mkdirSync(tmp, { recursive: true });

function transpile(rel, out) {
  let src = fs.readFileSync(path.join(root, rel), "utf8");
  src = src.replace(/@\/lib\/bisnis\//g, "./");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  fs.writeFileSync(path.join(tmp, out), js);
}

transpile("lib/bisnis/doc-print-types.ts", "doc-print-types.js");
transpile("lib/bisnis/doc-print-html.ts", "doc-print-html.js");
transpile("lib/bisnis/doc-print-css.ts", "doc-print-css.js");

const { renderBizDocumentBodyHtml } = require(path.join(tmp, "doc-print-html.js"));
const { BIZ_DOC_PRINT_CSS } = require(path.join(tmp, "doc-print-css.js"));

const invoice = {
  kind: "invoice",
  docNo: "INV-2026-06-0042",
  docDate: "10 Jun 2026",
  dueDate: "24 Jun 2026",
  refNo: "PO-CUST-889",
  linkedDoc: "SO: SO-2026-06-0031",
  seller: {
    name: "PT Serba Maju Bersama",
    address: "Jl. Industri Raya No. 88, Kawasan Niaga Blok C-12, Jakarta Utara 14140",
    phone: "021-555-0123",
    email: "sales@serbamaju.co.id",
  },
  party: {
    title: "Ditagihkan kepada",
    name: "CV Sumber Rejeki Abadi",
    address: "Jl. Pasar Baru Timur No. 17, Bandung 40111",
    phone: "0812-3456-7890",
    email: "purchasing@sumberrejeki.id",
  },
  lines: [
    { product: "Kertas A4 80gsm (rim)", qty: "120", unitPrice: "Rp 52.000", discount: "5%", lineTotal: "Rp 5.928.000" },
    { product: "Tinta Printer Hitam 70ml", qty: "36", unitPrice: "Rp 98.500", discount: "", lineTotal: "Rp 3.546.000" },
    { product: "Map Folder Plastik F4 — bungkus isi 12", qty: "50", unitPrice: "Rp 27.000", discount: "10%", lineTotal: "Rp 1.215.000" },
    { product: "Stapler Heavy Duty HD-50", qty: "8", unitPrice: "Rp 145.000", discount: "", lineTotal: "Rp 1.160.000" },
  ],
  totals: [
    { label: "Subtotal", value: "Rp 11.849.000" },
    { label: "Diskon", value: "-Rp 431.400", danger: true },
    { label: "PPN / Pajak", value: "Rp 1.255.936" },
    { label: "Materai", value: "Rp 10.000" },
    { label: "Ongkir", value: "Rp 85.000" },
    { label: "Total", value: "Rp 12.768.536", emphasis: true },
    { label: "Dibayar", value: "Rp 5.000.000" },
    { label: "Sisa tagihan", value: "Rp 7.768.536", danger: true },
  ],
  shippingInfo: {
    courier: "JNE",
    trackingNo: "JNE0099887766",
  },
  paymentInfo: {
    method: "Transfer Bank",
    bank: "BCA",
    accountNo: "884-019-2837",
    accountName: "PT Serba Maju Bersama",
  },
  notes: "Barang dikirim setelah DP 40% diterima.\nHarga sudah termasuk garansi tukar 7 hari.",
  legalFooter: "PT Serba Maju Bersama — NPWP 01.234.567.8-901.000",
};

const so = {
  ...invoice,
  kind: "sales_order",
  docNo: "SO-2026-06-0031",
  linkedDoc: undefined,
  party: { ...invoice.party, title: "Pelanggan" },
  totals: [
    { label: "Subtotal", value: "Rp 11.849.000" },
    { label: "Diskon", value: "-Rp 431.400", danger: true },
    { label: "PPN / Pajak", value: "Rp 1.255.936" },
    { label: "Ongkir", value: "Rp 85.000" },
    { label: "Total SO", value: "Rp 12.758.536", emphasis: true },
  ],
};

const paidInvoice = {
  ...invoice,
  docNo: "INV-2026-06-0040",
  legalFooter: undefined,
  totals: invoice.totals.slice(0, 6).concat([
    { label: "Dibayar", value: "Rp 12.768.536" },
    { label: "Sisa tagihan", value: "Rp 0", danger: false },
  ]),
};

function page(data, title) {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><title>${title}</title><style>${BIZ_DOC_PRINT_CSS}</style></head><body>${renderBizDocumentBodyHtml(data)}</body></html>`;
}

fs.writeFileSync(path.join(tmp, "preview-invoice.html"), page(invoice, "Invoice"));
fs.writeFileSync(path.join(tmp, "preview-so.html"), page(so, "SO"));
fs.writeFileSync(path.join(tmp, "preview-paid.html"), page(paidInvoice, "Paid"));
console.log("OK:", tmp);
