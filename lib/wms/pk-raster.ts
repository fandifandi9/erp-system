"use client";

import { generateQrDataUrl } from "@/lib/inventory/barcode-label-engine";
import type { PkReceiptData } from "./print-pk-receipt";

/** Slip PK dirender sebagai bitmap 1-bit (untuk ESC/POS raster). */
export type PkRaster = { widthDots: number; heightPx: number; dataB64: string };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function packMonochrome(ctx: CanvasRenderingContext2D, W: number, H: number): Uint8Array {
  const { data } = ctx.getImageData(0, 0, W, H);
  const bytesPerRow = Math.ceil(W / 8);
  const packed = new Uint8Array(bytesPerRow * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = data[i + 3]!;
      const lum = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
      if (a > 32 && lum < 160) {
        packed[y * bytesPerRow + (x >> 3)]! |= 0x80 >> (x & 7);
      }
    }
  }
  return packed;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Render satu slip PK menjadi bitmap (mirip layout HTML/dialog). */
export async function renderPkSlipRaster(data: PkReceiptData, widthDots: number): Promise<PkRaster> {
  const W = widthDots;
  const s = W / 384; // desain dasar untuk 58mm (384 dot)
  const pad = Math.round(18 * s);
  const gap = Math.round(10 * s);
  const qrSize = Math.round(210 * s);

  const qrImg = await loadImage(await generateQrDataUrl(data.pkNo, qrSize));

  const fTitle = `${Math.round(24 * s)}px Arial, sans-serif`;
  const fSub = `${Math.round(17 * s)}px Arial, sans-serif`;
  const fPkLabel = `bold ${Math.round(18 * s)}px Arial, sans-serif`;
  const fPk = `bold ${Math.round(46 * s)}px Arial, sans-serif`;
  const fSo = `${Math.round(19 * s)}px Arial, sans-serif`;
  const fMeta = `${Math.round(17 * s)}px Arial, sans-serif`;
  const fFoot = `${Math.round(14 * s)}px Arial, sans-serif`;

  const hTitle = Math.round(28 * s);
  const hSub = Math.round(22 * s);
  const hPkLabel = Math.round(24 * s);
  const hPk = Math.round(56 * s);
  const hSo = Math.round(26 * s);
  const hMeta = Math.round(24 * s);
  const hFoot = Math.round(22 * s);

  const customer = data.customerName?.trim();
  const warehouse = data.warehouseName?.trim();

  let H = pad;
  H += hTitle + hSub + gap;
  H += hPkLabel + hPk + gap;
  H += qrSize + gap;
  H += hSo + gap;
  if (customer) H += hMeta;
  if (warehouse) H += hMeta;
  H += gap + hFoot + pad;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung.");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  let cy = pad;
  const center = (txt: string, font: string, lh: number) => {
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.fillText(txt, Math.round(W / 2), cy);
    cy += lh;
  };
  const left = (txt: string, font: string, lh: number) => {
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.fillText(txt, pad, cy);
    cy += lh;
  };

  center("PICKING KIT", fTitle, hTitle);
  center("SERBA · WMS", fSub, hSub);
  cy += gap;
  center("PK", fPkLabel, hPkLabel);
  center(data.pkNo, fPk, hPk);
  cy += gap;
  ctx.drawImage(qrImg, Math.round((W - qrSize) / 2), cy, qrSize, qrSize);
  cy += qrSize + gap;
  center(`SO: ${data.orderNo}`, fSo, hSo);
  cy += gap;
  if (customer) left(`Pelanggan: ${customer}`, fMeta, hMeta);
  if (warehouse) left(`Gudang: ${warehouse}`, fMeta, hMeta);
  cy += gap;
  center("Tempel di paket · bukan AWB ekspedisi", fFoot, hFoot);

  const packed = packMonochrome(ctx, W, H);
  return { widthDots: W, heightPx: H, dataB64: toBase64(packed) };
}

export async function renderPkSlipRasters(
  list: PkReceiptData[],
  widthMm: number,
): Promise<PkRaster[]> {
  const widthDots = widthMm >= 80 ? 576 : 384;
  const out: PkRaster[] = [];
  for (const d of list) out.push(await renderPkSlipRaster(d, widthDots));
  return out;
}
