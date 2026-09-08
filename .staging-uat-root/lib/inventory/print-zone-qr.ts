import type { ZoneQrPrintMeta } from "@/lib/inventory/types";

export function printZoneQrLabel(meta: ZoneQrPrintMeta): void {
  if (typeof window === "undefined") return;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(meta.payload)}`;
  const whLine = [meta.warehouseCode, meta.warehouseName].filter(Boolean).join(" — ");
  const zoneLine = [meta.zoneName, meta.zoneCode ? `(${meta.zoneCode})` : ""].filter(Boolean).join(" ");
  const typeLine = meta.zoneType ? `Tipe: ${meta.zoneType}` : "";

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>QR ${meta.zoneCode}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 16mm;
      text-align: center;
      color: #0f172a;
    }
    .card {
      max-width: 90mm;
      margin: 0 auto;
      border: 2px solid #334155;
      border-radius: 8px;
      padding: 10mm 8mm;
    }
    h1 { font-size: 14pt; margin: 0 0 4px; }
    h2 { font-size: 11pt; margin: 0 0 8px; font-weight: 600; color: #475569; }
    .type { font-size: 9pt; color: #64748b; margin-bottom: 8px; }
    img { width: 55mm; height: 55mm; }
    .payload {
      font-family: ui-monospace, monospace;
      font-size: 7pt;
      word-break: break-all;
      margin-top: 8px;
      color: #64748b;
    }
    @media print {
      body { padding: 0; }
      .card { border-width: 1px; }
    }
  </style>
</head>
<body>
  <div class="card">
    ${whLine ? `<h1>${escapeHtml(whLine)}</h1>` : ""}
    <h2>${escapeHtml(zoneLine)}</h2>
    ${typeLine ? `<p class="type">${escapeHtml(typeLine)}</p>` : ""}
    <img src="${qrUrl}" alt="QR zona" />
    <p class="payload">${escapeHtml(meta.payload)}</p>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=480,height=720");
  if (!win) {
    alert("Izinkan pop-up untuk mencetak label QR.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
