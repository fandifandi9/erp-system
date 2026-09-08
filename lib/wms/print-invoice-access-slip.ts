"use client";

import { generateQrDataUrl } from "@/lib/inventory/barcode-label-engine";
import { printHtmlViaIframe } from "@/lib/wms/print-pk-receipt";
import { getInvoiceQrQzPrinterName, getPackPrintMode } from "@/lib/wms/pack-print-preferences";
import { printHtmlViaQz } from "@/lib/wms/qz-print";

export type InvoiceAccessSlipLine = {
  sku: string;
  name: string;
  qty: number;
};

export type InvoiceAccessSlipData = {
  invoiceNo: string;
  publicUrl: string;
  /** @deprecated tidak dicetak — slip memakai nomor invoice */
  orderNo?: string;
  /** Nama toko penjual — footer slip. */
  storeName?: string;
  packingList?: InvoiceAccessSlipLine[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Tipografi lebih besar agar terbaca di thermal 80mm tanpa scale browser rendah. */
const STYLE = `
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 2.5mm; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
.wrap { width: 72mm; max-width: 72mm; margin: 0 auto; }
.center { text-align: center; }
.store { font-size: 12pt; font-weight: 700; margin: 0 0 1mm; line-height: 1.2; }
.title { font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }
.sub { font-size: 9pt; margin: 1.5mm 0 0; color: #222; line-height: 1.25; }
.box { margin: 2.5mm 0; padding: 2.5mm; border: 2px solid #000; border-radius: 2mm; text-align: center; }
.inv { font-size: 13pt; font-weight: 700; margin: 0; word-break: break-all; }
.qr { width: 36mm; height: 36mm; margin: 2mm auto; display: block; }
.hint { font-size: 8.5pt; line-height: 1.3; margin: 1.5mm 0 0; color: #222; }
.list-title { font-size: 10pt; font-weight: 700; margin: 3mm 0 1.5mm; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px dashed #888; padding: 1.8mm 0.8mm; text-align: left; vertical-align: top; }
th { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; }
.pname { font-size: 11pt; font-weight: 700; line-height: 1.25; }
.psku { font-size: 8pt; color: #444; margin-top: 0.6mm; line-height: 1.2; }
.qty { text-align: right; width: 12mm; font-size: 12pt; font-weight: 700; vertical-align: middle; }
.check { width: 6mm; font-size: 12pt; vertical-align: middle; }
.foot { font-size: 8.5pt; text-align: center; color: #222; margin: 3mm 0 0; font-weight: 600; }
@media print {
  @page { size: 80mm auto; margin: 2mm; }
  body { padding: 0; }
}`;

function packingListHtml(lines: InvoiceAccessSlipLine[]): string {
  if (!lines.length) return "";
  const rows = lines
    .map(
      (l) => `<tr>
      <td class="check">☐</td>
      <td>
        <div class="pname">${escapeHtml(l.name)}</div>
        ${l.sku && l.sku !== "—" ? `<div class="psku">${escapeHtml(l.sku)}</div>` : ""}
      </td>
      <td class="qty">${l.qty}</td>
    </tr>`,
    )
    .join("");
  return `<p class="list-title">Packing list (ceklis)</p>
  <table>
    <thead><tr><th class="check"></th><th>Produk</th><th class="qty">Qty</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export async function buildInvoiceAccessSlipHtml(data: InvoiceAccessSlipData): Promise<string> {
  const qrImg = await generateQrDataUrl(data.publicUrl, 240);
  const store = (data.storeName || "").trim();
  const body = `<div class="wrap">
  ${store ? `<p class="center store">${escapeHtml(store)}</p>` : ""}
  <p class="center title">Akses Invoice</p>
  <p class="center sub">Scan QR · buka invoice</p>
  <div class="box">
    <p class="inv">${escapeHtml(data.invoiceNo)}</p>
    <img class="qr" src="${qrImg}" alt="qr-invoice" />
  </div>
  <p class="hint">Selipkan di paket · bukan label AWB</p>
  ${packingListHtml(data.packingList ?? [])}
  <p class="foot">${escapeHtml(store || "Invoice share")} · packing list</p>
</div>`;
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><title>Invoice QR</title>
<style>${STYLE}</style></head><body>${body}</body></html>`;
}

export async function printInvoiceAccessSlipBrowser(data: InvoiceAccessSlipData): Promise<void> {
  const html = await buildInvoiceAccessSlipHtml(data);
  await printHtmlViaIframe(html);
}

/** Cetak slip QR invoice (+ packing list) ke printer QZ atau browser. */
export async function printInvoiceAccessSlipSmart(data: InvoiceAccessSlipData): Promise<void> {
  const mode = getPackPrintMode();
  const html = await buildInvoiceAccessSlipHtml(data);
  if (mode === "qz") {
    const printer = getInvoiceQrQzPrinterName();
    if (!printer) throw new Error("Printer QR invoice (QZ) belum dipilih di pengaturan packing.");
    await printHtmlViaQz(printer, html);
    return;
  }
  await printHtmlViaIframe(html);
}
