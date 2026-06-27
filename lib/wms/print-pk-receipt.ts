import { generateCode128DataUrl, generateQrDataUrl } from "@/lib/inventory/barcode-label-engine";

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

/** Cetak slip PK ke printer kasir/termal 80mm — langsung pop-up dialog cetak. */
export async function printPkReceipt(data: PkReceiptData): Promise<void> {
  if (typeof window === "undefined") return;

  const [barcodeImg, qrImg] = await Promise.all([
    generateCode128DataUrl(data.pkNo, { barHeight: 72, barWidth: 2 }),
    generateQrDataUrl(data.qrPayload, 140),
  ]);

  const customer = data.customerName?.trim();
  const warehouse = data.warehouseName?.trim();

  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"/><title>PK ${escapeHtml(data.pkNo)}</title>
<style>
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 4mm; font-family: Consolas, "Courier New", monospace; color: #000; background: #fff; }
.wrap { width: 72mm; max-width: 72mm; margin: 0 auto; }
.center { text-align: center; }
.title { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; }
.sub { font-size: 8pt; margin: 2mm 0 0; color: #333; }
.box { margin: 4mm 0; padding: 3mm; border: 2px dashed #000; border-radius: 3mm; text-align: center; }
.pk { font-size: 22pt; font-weight: 700; letter-spacing: 0.12em; margin: 2mm 0 0; }
.pk-label { font-size: 9pt; font-weight: 700; letter-spacing: 0.2em; margin: 0; }
.so { font-size: 8pt; margin: 2mm 0 0; color: #333; }
.bc { max-width: 100%; height: auto; margin: 2mm auto; display: block; }
.qr { width: 28mm; height: 28mm; margin: 2mm auto; display: block; }
.meta { font-size: 8pt; line-height: 1.45; margin: 0; }
.meta span { color: #444; }
.hr { border: none; border-top: 1px dashed #888; margin: 3mm 0; }
.foot { font-size: 7pt; text-align: center; color: #555; margin: 0; }
@media print {
  @page { size: 80mm auto; margin: 3mm; }
  body { padding: 0; }
}
</style></head><body>
<div class="wrap">
  <p class="center title">Picking Kit</p>
  <p class="center sub">SERBA · WMS</p>
  <div class="box">
    <p class="center pk-label">PK</p>
    <p class="pk">${escapeHtml(data.pkNo)}</p>
    <img class="bc" src="${barcodeImg}" alt="barcode" />
    <img class="qr" src="${qrImg}" alt="qr" />
    <p class="center so">SO: ${escapeHtml(data.orderNo)}</p>
  </div>
  ${customer ? `<p class="meta"><span>Pelanggan:</span> ${escapeHtml(customer)}</p>` : ""}
  ${warehouse ? `<p class="meta"><span>Gudang:</span> ${escapeHtml(warehouse)}</p>` : ""}
  <hr class="hr" />
  <p class="foot">Tempel di paket · bukan AWB ekspedisi</p>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
</body></html>`;

  const win = window.open("", "_blank", "width=420,height=720");
  if (!win) {
    alert("Izinkan pop-up untuk mencetak slip PK.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
