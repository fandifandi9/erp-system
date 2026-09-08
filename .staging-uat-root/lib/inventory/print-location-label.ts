import { buildLocationQrPayload } from "@/lib/inventory/rack-builder";

export type LocationLabelPrintItem = {
  code: string;
  name: string;
  aisle?: string;
  rack?: string;
  level?: string;
  bin?: string;
};

export type LocationLabelPrintMeta = {
  warehouseCode: string;
  warehouseName?: string;
  items: LocationLabelPrintItem[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cetak stiker kode rak (barcode + QR) untuk ditempel di gudang. */
export function printLocationLabels(meta: LocationLabelPrintMeta): void {
  if (typeof window === "undefined") return;
  if (meta.items.length === 0) {
    alert("Tidak ada kode rak untuk dicetak.");
    return;
  }

  const whLine = [meta.warehouseCode, meta.warehouseName].filter(Boolean).join(" — ");

  const stickers = meta.items
    .map((item) => {
      const payload = buildLocationQrPayload(meta.warehouseCode, item.code);
      const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(item.code)}&code=Code128&dpi=96&dataseparator=`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`;
      const sub = [item.aisle && `Lorong ${item.aisle}`, item.rack && `Rak ${item.rack}`, item.level && `T${item.level}`, item.bin && `S${item.bin}`]
        .filter(Boolean)
        .join(" · ");

      return `<div class="sticker">
        ${whLine ? `<p class="wh">${escapeHtml(whLine)}</p>` : ""}
        <p class="code">${escapeHtml(item.code)}</p>
        <p class="name">${escapeHtml(item.name)}</p>
        ${sub ? `<p class="sub">${escapeHtml(sub)}</p>` : ""}
        <div class="codes">
          <img class="bc" src="${barcodeUrl}" alt="barcode" />
          <img class="qr" src="${qrUrl}" alt="qr" />
        </div>
      </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Label lokasi rak</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 8mm; color: #0f172a; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 58mm);
      gap: 4mm;
    }
    .sticker {
      width: 58mm;
      min-height: 42mm;
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      padding: 3mm;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .wh { font-size: 5pt; color: #64748b; margin: 0 0 3px; }
    .code { font-family: ui-monospace, monospace; font-size: 11pt; font-weight: 800; margin: 0; letter-spacing: 0.02em; }
    .name { font-size: 6pt; margin: 2px 0 0; color: #475569; }
    .sub { font-size: 5pt; color: #94a3b8; margin: 2px 0 4px; }
    .codes { display: flex; align-items: center; justify-content: center; gap: 2mm; margin-top: 2px; }
    .bc { width: 34mm; height: 10mm; object-fit: contain; }
    .qr { width: 14mm; height: 14mm; }
    @media print {
      body { padding: 0; }
      .sticker { border-color: #cbd5e1; }
    }
  </style>
</head>
<body>
  <div class="grid">${stickers}</div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) {
    alert("Izinkan pop-up untuk mencetak label rak.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
