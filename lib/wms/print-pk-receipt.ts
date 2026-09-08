import { generateQrDataUrl } from "@/lib/inventory/barcode-label-engine";

export type PkReceiptData = {
  pkNo: string;
  qrPayload: string;
  orderNo: string;
  customerName?: string;
  warehouseName?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PK_RECEIPT_STYLE = `
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 4mm; font-family: Consolas, "Courier New", monospace; color: #000; background: #fff; }
.wrap { width: 72mm; max-width: 72mm; margin: 0 auto; }
.wrap + .wrap { margin-top: 6mm; }
.center { text-align: center; }
.title { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; }
.sub { font-size: 8pt; margin: 2mm 0 0; color: #333; }
.box { margin: 3mm 0; padding: 3mm; border: 2px dashed #000; border-radius: 3mm; text-align: center; }
.pk { font-size: 20pt; font-weight: 700; letter-spacing: 0.1em; margin: 1mm 0 0; }
.pk-label { font-size: 9pt; font-weight: 700; letter-spacing: 0.2em; margin: 0; }
.so { font-size: 8pt; margin: 2mm 0 0; color: #333; }
.qr { width: 34mm; height: 34mm; margin: 2mm auto; display: block; }
.meta { font-size: 8pt; line-height: 1.45; margin: 0; }
.meta span { color: #444; }
.hr { border: none; border-top: 1px dashed #888; margin: 3mm 0; }
.foot { font-size: 7pt; text-align: center; color: #555; margin: 0; }
@media print {
  @page { size: 80mm auto; margin: 3mm; }
  body { padding: 0; }
  .wrap { break-inside: avoid; }
  .wrap + .wrap { margin-top: 0; break-before: page; }
}`;

function slipHtml(data: PkReceiptData, qrImg: string): string {
  const customer = data.customerName?.trim();
  const warehouse = data.warehouseName?.trim();
  return `<div class="wrap">
  <p class="center title">Picking Kit</p>
  <p class="center sub">SERBA · WMS</p>
  <div class="box">
    <p class="center pk-label">PK</p>
    <p class="pk">${escapeHtml(data.pkNo)}</p>
    <img class="qr" src="${qrImg}" alt="qr" />
    <p class="center so">SO: ${escapeHtml(data.orderNo)}</p>
  </div>
  ${customer ? `<p class="meta"><span>Pelanggan:</span> ${escapeHtml(customer)}</p>` : ""}
  ${warehouse ? `<p class="meta"><span>Gudang:</span> ${escapeHtml(warehouse)}</p>` : ""}
  <hr class="hr" />
  <p class="foot">Tempel di paket · bukan AWB ekspedisi</p>
</div>`;
}

/** Cetak lewat iframe tersembunyi — tidak butuh izin pop-up (jalan saat auto-cetak). */
export function printHtmlViaIframe(html: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.setTimeout(() => {
        iframe.remove();
        resolve();
      }, 1000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (win) {
          win.focus();
          // Beri jeda kecil agar gambar data-URL (QR) selesai render.
          window.setTimeout(() => {
            try {
              win.print();
            } catch {
              /* abaikan */
            }
            cleanup();
          }, 250);
          return;
        }
      } catch {
        /* abaikan */
      }
      cleanup();
    };

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    // Fallback bila onload tak terpicu.
    window.setTimeout(cleanup, 8000);
  });
}

/** Bangun HTML dokumen slip PK (satu atau banyak) — dipakai iframe & QZ Tray. */
export async function buildPkReceiptsHtml(list: PkReceiptData[]): Promise<string> {
  // QR saja — lebih mudah discan walau kecil, sekaligus hemat kertas.
  const qrImgs = await Promise.all(list.map((d) => generateQrDataUrl(d.qrPayload, 220)));
  const bodies = list.map((d, i) => slipHtml(d, qrImgs[i]!)).join("\n");
  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"/><title>PK slip (${list.length})</title>
<style>${PK_RECEIPT_STYLE}</style></head><body>
${bodies}
</body></html>`;
}

/** Cetak banyak slip PK dalam SATU dokumen (satu dialog cetak, tiap slip 1 halaman). */
export async function printPkReceipts(list: PkReceiptData[]): Promise<void> {
  if (typeof window === "undefined" || list.length === 0) return;
  const html = await buildPkReceiptsHtml(list);
  await printHtmlViaIframe(html);
}

/** Cetak slip PK tunggal ke printer termal 80mm. */
export async function printPkReceipt(data: PkReceiptData): Promise<void> {
  await printPkReceipts([data]);
}
