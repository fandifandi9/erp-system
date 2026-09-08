"use client";

import { printHtmlViaIframe } from "@/lib/wms/print-pk-receipt";
import {
  getHandoverQzPrinterName,
  getPackPrintMode,
} from "@/lib/wms/pack-print-preferences";
import { printHtmlViaQz } from "@/lib/wms/qz-print";
import type { TtLineSnapshot } from "@/lib/wms/tt-number";

/** Satu tanda terima (TT) — bisa 1 atau banyak paket. */
export type HandoverReceiptPrintData = {
  ttNo: string;
  courierCompany: string;
  courierName: string;
  courierPhone?: string;
  /** @deprecated tidak dicetak di header — toko per baris */
  warehouseName?: string;
  warehouseStaff?: string;
  printedAt?: string;
  items: TtLineSnapshot[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Slip termal 80mm — padat: 1 baris = nomor + kode | toko (hemat kertas kontinu). */
const STYLE = `
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 1.5mm; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
.wrap { width: 74mm; max-width: 74mm; margin: 0 auto; }
.center { text-align: center; }
.title { font-size: 11pt; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 0.03em; }
.sub { font-size: 8pt; color: #222; margin: 0.6mm 0 0; }
.hr { border: none; border-top: 1px solid #000; margin: 1.4mm 0; }
.id-box { margin: 1mm 0; padding: 1.2mm; border: 1.5px solid #000; text-align: center; }
.id-lab { font-size: 7pt; font-weight: 700; text-transform: uppercase; margin: 0; }
.id-val { font-size: 11pt; font-weight: 700; font-family: Consolas, "Courier New", monospace; margin: 0.6mm 0 0; word-break: break-all; line-height: 1.15; }
.meta { font-size: 8.5pt; margin: 0.4mm 0; line-height: 1.2; }
.meta b { font-weight: 700; }
.pkg-count { font-size: 8.5pt; font-weight: 700; margin: 0.8mm 0 0.4mm; }
.daftar-lab { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; margin: 0 0 0.4mm; color: #333; }
.item { border-top: 1px dashed #666; padding: 0.5mm 0; }
.item:first-of-type { border-top: none; }
.row { display: flex; gap: 1mm; align-items: baseline; width: 100%; }
.no { width: 4.5mm; flex-shrink: 0; font-size: 9pt; font-weight: 700; color: #333; }
.code { flex: 1; min-width: 0; font-size: 10pt; font-weight: 700; font-family: Consolas, "Courier New", monospace; word-break: break-all; line-height: 1.15; }
.store { flex: 0 1 38%; max-width: 38%; text-align: right; font-size: 7.5pt; color: #333; line-height: 1.15; word-break: break-word; }
.signs { display: flex; gap: 3mm; margin-top: 3mm; }
.sign { flex: 1; font-size: 8pt; }
.sign-lab { font-weight: 700; }
.sign-line { border-bottom: 1px solid #000; margin-top: 8mm; }
.sign-name { margin-top: 0.8mm; font-size: 7.5pt; }
@media print {
  @page { size: 80mm auto; margin: 1.5mm; }
  body { padding: 0; }
}`;

export function buildHandoverReceiptHtml(data: HandoverReceiptPrintData): string {
  const now =
    data.printedAt ??
    new Date().toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const phone = data.courierPhone?.trim();
  const items = data.items.length > 0 ? data.items : [];
  const itemHtml = items
    .map((it, idx) => {
      const code =
        (it.awb?.trim() && it.awb !== "—" ? it.awb.trim() : "") ||
        (it.pk_no?.trim() && it.pk_no !== "—" ? it.pk_no.trim() : "") ||
        "—";
      const store = it.store_name?.trim() || "—";
      return `<div class="item">
  <div class="row">
    <div class="no">${idx + 1}.</div>
    <div class="code">${escapeHtml(code)}</div>
    <div class="store">${escapeHtml(store)}</div>
  </div>
</div>`;
    })
    .join("");

  const body = `<div class="wrap">
  <p class="center title">Tanda Terima</p>
  <p class="center sub"><b>Tanggal transaksi</b><br/>${escapeHtml(now)}</p>
  <hr class="hr" />
  <div class="id-box">
    <p class="id-lab">No. TT</p>
    <p class="id-val">${escapeHtml(data.ttNo)}</p>
  </div>
  <div class="meta"><b>Ekspedisi</b> ${escapeHtml(data.courierCompany || "—")}</div>
  <div class="meta"><b>Pengambil</b> ${escapeHtml(data.courierName || "—")}</div>
  ${phone ? `<div class="meta"><b>HP</b> ${escapeHtml(phone)}</div>` : ""}
  <div class="pkg-count">${items.length} paket</div>
  <hr class="hr" />
  <p class="daftar-lab">Daftar</p>
  ${itemHtml}
  <hr class="hr" />
  <div class="signs">
    <div class="sign">
      <div class="sign-lab">Petugas</div>
      <div class="sign-line"></div>
      <div class="sign-name">${escapeHtml(data.warehouseStaff?.trim() || "_______________")}</div>
    </div>
    <div class="sign">
      <div class="sign-lab">Pengambil</div>
      <div class="sign-line"></div>
      <div class="sign-name">${escapeHtml(data.courierName?.trim() || "_______________")}</div>
    </div>
  </div>
</div>`;

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><title>TT ${escapeHtml(data.ttNo)}</title>
<style>${STYLE}</style></head><body>${body}</body></html>`;
}

/** Cetak tanda terima ke printer termal 80mm (QZ atau browser). */
export async function printHandoverReceiptSmart(data: HandoverReceiptPrintData): Promise<void> {
  const html = buildHandoverReceiptHtml(data);
  const mode = getPackPrintMode();
  if (mode === "qz") {
    const printer = getHandoverQzPrinterName();
    if (!printer) {
      throw new Error(
        "Printer tanda terima (termal 80mm) belum dipilih — atur di Mode/Meja packing.",
      );
    }
    await printHtmlViaQz(printer, html);
    return;
  }
  await printHtmlViaIframe(html);
}
