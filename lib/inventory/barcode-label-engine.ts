/** Mesin label barcode/QR — termal & kertas A4/A5/A6, cetak & unduh. */

export type BarcodeSymbology = "code128" | "qr";

export type PaperKind = "thermal" | "a4" | "a5" | "a6";

export type DownloadFormat = "jpg" | "png" | "pdf" | "raw";

export type BarcodeLabelItem = {
  encodeValue: string;
  /** Judul / nama produk */
  title?: string;
};

export type LabelDimensions = {
  widthMm: number;
  heightMm: number;
};

export type BarcodeLabelJob = {
  items: BarcodeLabelItem[];
  copiesPerItem: number;
  paper: PaperKind;
  label: LabelDimensions;
  symbology: BarcodeSymbology;
  showTitle: boolean;
  showCode: boolean;
};

export const SHEET_PAPERS: { id: PaperKind; label: string; widthMm: number; heightMm: number }[] = [
  { id: "a4", label: "A4 (210 × 297 mm)", widthMm: 210, heightMm: 297 },
  { id: "a5", label: "A5 (148 × 210 mm)", widthMm: 148, heightMm: 210 },
  { id: "a6", label: "A6 (105 × 148 mm)", widthMm: 105, heightMm: 148 },
];

/** Ukuran stiker termal umum (Lebar × Tinggi mm). */
export const THERMAL_LABEL_PRESETS: { label: string; widthMm: number; heightMm: number }[] = [
  { label: "30 × 20 mm", widthMm: 30, heightMm: 20 },
  { label: "30 × 15 mm", widthMm: 30, heightMm: 15 },
  { label: "40 × 30 mm", widthMm: 40, heightMm: 30 },
  { label: "50 × 30 mm", widthMm: 50, heightMm: 30 },
  { label: "58 × 40 mm", widthMm: 58, heightMm: 40 },
  { label: "80 × 50 mm", widthMm: 80, heightMm: 50 },
];

const MM_TO_PX = 3.78;

export function normalizeEncodeValue(raw: string): string {
  const v = raw.trim();
  if (!v) throw new Error("Kode barcode/QR kosong.");
  if (v.length > 80) throw new Error("Kode terlalu panjang (maks. 80 karakter).");
  return v;
}

export function isCode128Safe(value: string): boolean {
  return /^[\x20-\x7E]+$/.test(value);
}

export function sheetGrid(
  paper: (typeof SHEET_PAPERS)[number],
  label: LabelDimensions,
): { cols: number; rows: number; perPage: number } {
  const margin = 8;
  const cols = Math.max(1, Math.floor((paper.widthMm - margin * 2) / label.widthMm));
  const rows = Math.max(1, Math.floor((paper.heightMm - margin * 2) / label.heightMm));
  return { cols, rows, perPage: cols * rows };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function generateCode128DataUrl(
  value: string,
  opts?: { barWidth?: number; barHeight?: number },
): Promise<string> {
  const text = normalizeEncodeValue(value);
  if (!isCode128Safe(text)) {
    throw new Error("Code128 hanya huruf/angka standar (tanpa aksen).");
  }
  const JsBarcode = (await import("jsbarcode")).default;
  const canvas = document.createElement("canvas");
  const h = opts?.barHeight ?? 44;
  JsBarcode(canvas, text, {
    format: "CODE128",
    width: opts?.barWidth ?? 2,
    height: h,
    displayValue: false,
    margin: 8,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas.toDataURL("image/png");
}

export async function generateQrDataUrl(value: string, pixelSize = 200): Promise<string> {
  const text = normalizeEncodeValue(value);
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: pixelSize,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

type CodeImages = { code128?: string; qr?: string };

async function loadCodeImages(
  value: string,
  symbology: BarcodeSymbology,
  label: LabelDimensions,
): Promise<CodeImages> {
  const barH =
    label.heightMm <= 20 ? 32 : label.heightMm <= 30 ? 38 : label.heightMm <= 40 ? 44 : 52;
  const qrPx =
    label.heightMm <= 20 ? 120 : label.heightMm <= 30 ? 150 : label.heightMm <= 40 ? 180 : 220;
  if (symbology === "code128") {
    return { code128: await generateCode128DataUrl(value, { barHeight: barH }) };
  }
  return { qr: await generateQrDataUrl(value, qrPx) };
}

function expandItems(job: BarcodeLabelJob): BarcodeLabelItem[] {
  const copies = Math.min(Math.max(1, Math.floor(job.copiesPerItem)), 500);
  const flat: BarcodeLabelItem[] = [];
  for (const item of job.items) {
    for (let c = 0; c < copies; c++) flat.push(item);
  }
  return flat;
}

/** Render satu label ke canvas (untuk unduh). */
export async function renderLabelCanvas(
  item: BarcodeLabelItem,
  job: Pick<BarcodeLabelJob, "label" | "symbology" | "showTitle" | "showCode">,
): Promise<HTMLCanvasElement> {
  const value = normalizeEncodeValue(item.encodeValue);
  const w = Math.round(job.label.widthMm * MM_TO_PX);
  const h = Math.round(job.label.heightMm * MM_TO_PX);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const imgs = await loadCodeImages(value, job.symbology, job.label);
  const pad = Math.max(4, Math.round(w * 0.04));
  let y = pad;

  const title = item.title?.trim() ?? "";
  if (job.showTitle && title) {
    const fontSize = Math.max(8, Math.min(14, Math.round(h * 0.14)));
    ctx.fillStyle = "#000";
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "center";
    const maxW = w - pad * 2;
    let t = title;
    while (ctx.measureText(t).width > maxW && t.length > 3) t = `${t.slice(0, -1)}…`;
    ctx.fillText(t, w / 2, y + fontSize);
    y += fontSize + pad * 0.5;
  }

  const codeTop = y;
  const codeAreaH = h - codeTop - (job.showCode ? Math.max(12, h * 0.12) : 0) - pad;

  const drawImg = (src: string, maxW: number, maxH: number) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (w - dw) / 2, codeTop + (codeAreaH - dh) / 2, dw, dh);
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });

  if (imgs.code128) await drawImg(imgs.code128, w - pad * 2, codeAreaH);
  else if (imgs.qr) await drawImg(imgs.qr, Math.min(w - pad * 2, codeAreaH), codeAreaH);

  if (job.showCode) {
    const fontSize = Math.max(7, Math.min(11, Math.round(h * 0.11)));
    ctx.fillStyle = "#000";
    ctx.font = `bold ${fontSize}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(value, w / 2, h - pad);
  }

  return canvas;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal JPG"))), "image/jpeg", quality);
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal PNG"))), "image/png");
  });
}

function canvasToRawBlob(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const header = new ArrayBuffer(8);
  const view = new DataView(header);
  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  return new Blob([header, imageData.data], { type: "application/octet-stream" });
}

export async function downloadBarcodeLabels(
  job: BarcodeLabelJob,
  format: DownloadFormat,
): Promise<void> {
  if (typeof window === "undefined") return;
  const flat = expandItems(job);
  if (flat.length === 0) throw new Error("Tidak ada label.");

  const stamp = new Date().toISOString().slice(0, 10);
  const first = flat[0]!;
  const safeCode = first.encodeValue.replace(/[^\w.-]+/g, "_").slice(0, 40);

  if (format === "pdf") {
    const { exportBarcodeLabelsPdf } = await import("@/lib/inventory/barcode-label-pdf");
    await exportBarcodeLabelsPdf(job, flat, safeCode, stamp);
    return;
  }

  const canvas = await renderLabelCanvas(first, job);
  if (format === "jpg") {
    triggerDownload(await canvasToJpegBlob(canvas), `label-${safeCode}-${stamp}.jpg`);
  } else if (format === "png") {
    triggerDownload(await canvasToPngBlob(canvas), `label-${safeCode}-${stamp}.png`);
  } else if (format === "raw") {
    triggerDownload(canvasToRawBlob(canvas), `label-${safeCode}-${stamp}.raw`);
  }

  if (flat.length > 1 && format !== "pdf") {
    alert(
      `Unduh ${format.toUpperCase()} untuk label pertama (${safeCode}). Untuk banyak salinan gunakan PDF.`,
    );
  }
}

type StickerRender = {
  title: string;
  code: string;
  codeImg: string;
  symbology: BarcodeSymbology;
};

async function renderStickerData(
  item: BarcodeLabelItem,
  job: BarcodeLabelJob,
): Promise<StickerRender> {
  const code = normalizeEncodeValue(item.encodeValue);
  const imgs = await loadCodeImages(code, job.symbology, job.label);
  return {
    title: item.title?.trim() ?? "",
    code,
    codeImg: imgs.code128 ?? imgs.qr ?? "",
    symbology: job.symbology,
  };
}

function stickerHtml(s: StickerRender, job: BarcodeLabelJob): string {
  const lines: string[] = [];
  if (job.showTitle && s.title) {
    lines.push(`<p class="title">${escapeHtml(s.title)}</p>`);
  }
  const imgClass = job.symbology === "qr" ? "qr" : "bc";
  lines.push(`<div class="codes"><img class="${imgClass}" src="${s.codeImg}" alt="code" /></div>`);
  if (job.showCode) {
    lines.push(`<p class="code">${escapeHtml(s.code)}</p>`);
  }
  return `<div class="sticker ${job.symbology}">${lines.join("")}</div>`;
}

export async function printBarcodeLabels(job: BarcodeLabelJob): Promise<void> {
  if (typeof window === "undefined") return;
  const flat = expandItems(job);
  if (flat.length === 0) {
    alert("Tidak ada label untuk dicetak.");
    return;
  }

  const { widthMm, heightMm } = job.label;
  const thermal = job.paper === "thermal";
  const paper = SHEET_PAPERS.find((p) => p.id === job.paper);
  const grid = paper ? sheetGrid(paper, job.label) : null;

  const rendered: string[] = [];
  for (const item of flat) {
    const s = await renderStickerData(item, job);
    rendered.push(stickerHtml(s, job));
  }

  const pageCss = thermal
    ? `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`
    : paper
      ? `@page { size: ${paper.widthMm}mm ${paper.heightMm}mm; margin: 8mm; }`
      : `@page { margin: 8mm; }`;

  const gridCss = thermal
    ? `grid-template-columns: ${widthMm}mm; gap: 0;`
    : grid
      ? `grid-template-columns: repeat(${grid.cols}, ${widthMm}mm); gap: 2mm;`
      : `grid-template-columns: ${widthMm}mm; gap: 2mm;`;

  const titleSize = heightMm <= 20 ? "6pt" : heightMm <= 30 ? "7pt" : "8pt";
  const codeSize = heightMm <= 20 ? "6pt" : "7pt";

  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"/><title>Cetak label</title>
<style>
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: ${thermal ? "0" : "0"}; font-family: Arial, sans-serif; color: #000; }
.grid { display: grid; ${gridCss} justify-content: start; }
.sticker {
  width: ${widthMm}mm; height: ${heightMm}mm; padding: 1mm 1.5mm;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; overflow: hidden; background: #fff;
  border: ${thermal ? "none" : "1px dashed #ddd"};
}
.title { font-size: ${titleSize}; font-weight: 700; margin: 0 0 0.5mm; line-height: 1.1;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code { font-family: Consolas, monospace; font-size: ${codeSize}; font-weight: 700; margin: 0.3mm 0 0; }
.codes { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; min-height: 0; }
.bc { max-width: 96%; max-height: ${Math.round(heightMm * 0.55)}mm; object-fit: contain; }
.qr { max-width: ${Math.min(widthMm * 0.75, heightMm * 0.65)}mm; max-height: ${Math.min(widthMm * 0.75, heightMm * 0.65)}mm; object-fit: contain; }
@media print {
  .sticker { page-break-inside: avoid; break-inside: avoid; }
  ${thermal ? ".sticker { page-break-after: always; }" : ""}
  ${pageCss}
}
</style></head><body><div class="grid">${rendered.join("")}</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) {
    alert("Izinkan pop-up untuk mencetak.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function productToLabelItem(p: {
  sku: string;
  barcode?: string | null;
  name: string;
}): BarcodeLabelItem {
  return {
    encodeValue: (p.barcode?.trim() || p.sku?.trim() || "").trim(),
    title: p.name,
  };
}

export function buildJob(
  items: BarcodeLabelItem[],
  opts: Omit<BarcodeLabelJob, "items">,
): BarcodeLabelJob {
  return { items, ...opts };
}
