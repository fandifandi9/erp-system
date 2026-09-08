/**
 * Builder ESC/POS untuk slip PK — dikirim langsung ke printer termal jaringan
 * (mis. iWare 260WF via IP:9100). Aman di server (tanpa DOM), mengembalikan byte.
 */

export type EscposSlip = {
  pkNo: string;
  orderNo: string;
  customerName?: string;
  warehouseName?: string;
};

const ESC = 0x1b;
const GS = 0x1d;

/** Teks → byte (ASCII/latin1; karakter non-latin diganti '?'). */
function text(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out.push(c > 255 ? 0x3f : c);
  }
  return out;
}

/** QR code via GS ( k (ESC/POS model 2) — didukung mayoritas printer termal. */
function qr(data: string, moduleSize = 6): number[] {
  const d = text(data);
  const len = d.length + 3;
  const pL = len & 0xff;
  const pH = (len >> 8) & 0xff;
  return [
    // pilih model 2
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    // ukuran modul
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, moduleSize)),
    // level koreksi error M
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    // simpan data
    GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...d,
    // cetak
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

export type EscposRaster = {
  widthDots: number;
  heightPx: number;
  bytes: Uint8Array | number[];
};

/**
 * Cetak slip sebagai GAMBAR (raster GS v 0) — hasil identik dengan layout HTML/dialog.
 * Feed cukup sebelum cut agar bagian bawah tidak terpotong.
 */
export function buildPkRasterEscpos(
  rasters: EscposRaster[],
  opts?: { cut?: boolean },
): number[] {
  const out: number[] = [];
  out.push(ESC, 0x40); // init

  for (const r of rasters) {
    const bytesPerRow = Math.ceil(r.widthDots / 8);
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = r.heightPx & 0xff;
    const yH = (r.heightPx >> 8) & 0xff;

    out.push(ESC, 0x61, 0x00); // kiri (raster sudah selebar kertas)
    out.push(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH); // GS v 0
    const b = r.bytes;
    for (let i = 0; i < b.length; i++) out.push(b[i]!);

    out.push(ESC, 0x64, 0x05); // feed 5 baris → lewati cutter, tidak kepotong
    if (opts?.cut !== false) {
      out.push(GS, 0x56, 0x01); // partial cut
    }
  }

  return out;
}

/** Bangun byte ESC/POS untuk satu atau banyak slip PK (mode teks). */
export function buildPkEscpos(
  slips: EscposSlip[],
  opts?: { widthMm?: number; cut?: boolean },
): number[] {
  const moduleSize = (opts?.widthMm ?? 58) >= 80 ? 8 : 6;
  const out: number[] = [];
  out.push(ESC, 0x40); // init

  for (const s of slips) {
    out.push(ESC, 0x61, 0x01); // center
    out.push(...text("PICKING KIT"), 0x0a);
    out.push(...text("SERBA - WMS"), 0x0a, 0x0a);

    // PK besar + tebal
    out.push(ESC, 0x45, 0x01); // bold on
    out.push(GS, 0x21, 0x11); // double width + height
    out.push(...text(`PK ${s.pkNo}`), 0x0a);
    out.push(GS, 0x21, 0x00); // normal
    out.push(ESC, 0x45, 0x00); // bold off
    out.push(0x0a);

    // QR (isi = kode PK polos)
    out.push(...qr(s.pkNo, moduleSize));
    out.push(0x0a);
    out.push(...text(`SO: ${s.orderNo}`), 0x0a);

    out.push(ESC, 0x61, 0x00); // left
    if (s.customerName?.trim()) out.push(...text(`Pelanggan: ${s.customerName.trim()}`), 0x0a);
    if (s.warehouseName?.trim()) out.push(...text(`Gudang: ${s.warehouseName.trim()}`), 0x0a);
    out.push(...text("Tempel di paket - bukan AWB"), 0x0a);

    out.push(ESC, 0x64, 0x03); // feed 3 baris
    if (opts?.cut !== false) {
      out.push(GS, 0x56, 0x01); // partial cut
    } else {
      out.push(ESC, 0x64, 0x02);
    }
  }

  return out;
}
