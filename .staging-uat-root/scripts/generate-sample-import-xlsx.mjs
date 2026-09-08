/**
 * Generate contoh Excel import penjualan → public/samples/
 * Jalankan: npm run sample:import-xlsx
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const COLUMNS = [
  ["toko (*)", "toko", 14],
  ["pelanggan (*)", "pelanggan", 22],
  ["email", "email", 22],
  ["no_so", "no_so", 16],
  ["no_referensi", "no_referensi", 18],
  ["tgl_transaksi (*)", "tgl_transaksi", 14],
  ["jatuh_tempo", "jatuh_tempo", 14],
  ["term", "term", 14],
  ["metode_bayar", "metode_bayar", 16],
  ["lewat_wms (Y/T)", "lewat_wms", 12],
  ["pesan", "pesan", 20],
  ["memo", "memo", 18],
  ["harga_termasuk_ppn (Y/T)", "harga_termasuk_ppn", 14],
  ["ppn_persen", "ppn_persen", 10],
  ["diskon_order", "diskon_order", 12],
  ["diskon_order_tipe (persen/nominal)", "diskon_order_tipe", 18],
  ["materai", "materai", 12],
  ["mp_order_no (*)", "mp_order_no", 20],
  ["pembeli_mp", "pembeli_mp", 20],
  ["ekspedisi", "ekspedisi", 14],
  ["no_resi", "no_resi", 16],
  ["ongkir", "ongkir", 12],
  ["alamat_kirim", "alamat_kirim", 28],
  ["mp_sku (*)", "mp_sku", 18],
  ["nama_produk", "nama_produk", 28],
  ["catatan_baris", "catatan_baris", 18],
  ["qty (*)", "qty", 8],
  ["unit", "unit", 8],
  ["harga_satuan (*)", "harga_satuan", 14],
  ["diskon_baris_pct", "diskon_baris_pct", 12],
];

const TX = new Date(2026, 5, 17);
const DUE = new Date(2026, 6, 1);

/** 3 baris: 1 order WMS + 1 order 2 baris langsung — semua kolom terisi */
const ROWS = [
  {
    toko: "COSTA",
    pelanggan: "defan",
    email: "defan@email.com",
    no_so: "",
    no_referensi: "REF-SHOPEE-001",
    tgl_transaksi: TX,
    jatuh_tempo: DUE,
    term: "Net 14",
    metode_bayar: "Transfer Bank",
    lewat_wms: "T",
    pesan: "Terima kasih sudah berbelanja",
    memo: "Contoh order lewat WMS",
    harga_termasuk_ppn: "T",
    ppn_persen: 11,
    diskon_order: 0,
    diskon_order_tipe: "persen",
    materai: 0,
    mp_order_no: "ORD-20260617-001",
    pembeli_mp: "Defan Pratama",
    ekspedisi: "JNE Reguler",
    no_resi: "JX1234567890ID",
    ongkir: 18000,
    alamat_kirim: "Jl. Melati No. 8, RT 02 RW 05, Jakarta Selatan 12730",
    mp_sku: "22344FGG56666",
    nama_produk: "COSTA CT-6218 Tripod",
    catatan_baris: "Warna hitam",
    qty: 2,
    unit: "pcs",
    harga_satuan: 475000,
    diskon_baris_pct: 0,
  },
  {
    toko: "COSTA",
    pelanggan: "ajas",
    email: "ajas@email.com",
    no_so: "",
    no_referensi: "REF-TOKPED-002",
    tgl_transaksi: TX,
    jatuh_tempo: DUE,
    term: "Cash",
    metode_bayar: "Cash",
    lewat_wms: "F",
    pesan: "Mohon dikirim cepat",
    memo: "Contoh order langsung tanpa WMS",
    harga_termasuk_ppn: "T",
    ppn_persen: 11,
    diskon_order: 5,
    diskon_order_tipe: "persen",
    materai: 10000,
    mp_order_no: "ORD-20260617-002",
    pembeli_mp: "Ajas Wijaya",
    ekspedisi: "AnterAja",
    no_resi: "AN9876543210",
    ongkir: 22000,
    alamat_kirim: "Perumahan Griya Asri Blok C12, Bekasi 17145",
    mp_sku: "22344FGG56666",
    nama_produk: "COSTA CT-6218 Tripod",
    catatan_baris: "Baris 1 dari 2",
    qty: 1,
    unit: "pcs",
    harga_satuan: 475000,
    diskon_baris_pct: 0,
  },
  {
    toko: "COSTA",
    pelanggan: "ajas",
    email: "ajas@email.com",
    no_so: "",
    no_referensi: "REF-TOKPED-002",
    tgl_transaksi: TX,
    jatuh_tempo: DUE,
    term: "Cash",
    metode_bayar: "Cash",
    lewat_wms: "F",
    pesan: "Mohon dikirim cepat",
    memo: "Contoh order langsung tanpa WMS",
    harga_termasuk_ppn: "T",
    ppn_persen: 11,
    diskon_order: 5,
    diskon_order_tipe: "persen",
    materai: 10000,
    mp_order_no: "ORD-20260617-002",
    pembeli_mp: "Ajas Wijaya",
    ekspedisi: "AnterAja",
    no_resi: "AN9876543210",
    ongkir: 22000,
    alamat_kirim: "Perumahan Griya Asri Blok C12, Bekasi 17145",
    mp_sku: "22344FGG56666",
    nama_produk: "COSTA CT-6218 Tripod",
    catatan_baris: "Baris 2 dari 2",
    qty: 1,
    unit: "pcs",
    harga_satuan: 475000,
    diskon_baris_pct: 10,
  },
];

const PETUNJUK = [
  ["Langkah / Kolom", "Keterangan"],
  ["1. Pilih toko", "Saat upload pilih toko COSTA — nama harus sama dengan kolom toko (*)."],
  ["2. Kontak", "Pelanggan defan & ajas harus ada di menu Kontak (buat dulu jika belum)."],
  ["3. SKU", "mp_sku 22344FGG56666 harus ada di Katalog Produk."],
  ["4. Posting", "Upload → validasi → posting → SO & invoice terbentuk otomatis."],
  ["", ""],
  ["Kolom wajib (*)", "toko, pelanggan, tgl_transaksi, mp_order_no, mp_sku, qty, harga_satuan"],
  ["lewat_wms T", "Antre gudang (WMS) — invoice setelah gudang selesai"],
  ["lewat_wms F", "Langsung SO + invoice"],
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SERBA System";

  const ws = wb.addWorksheet("Penjualan");
  ws.columns = COLUMNS.map(([header, key, width]) => ({ header, key, width }));
  const h = ws.getRow(1);
  h.font = { bold: true };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  for (const row of ROWS) {
    ws.addRow(row);
  }

  const dateCols = new Set(["tgl_transaksi", "jatuh_tempo"]);
  const idrCols = new Set(["harga_satuan"]);
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    COLUMNS.forEach(([, key], i) => {
      const cell = row.getCell(i + 1);
      if (dateCols.has(key)) cell.numFmt = "dd/mm/yyyy";
      if (idrCols.has(key)) cell.numFmt = '"Rp"#,##0';
    });
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const guide = wb.addWorksheet("Petunjuk");
  for (const line of PETUNJUK) guide.addRow(line);
  guide.getColumn(1).width = 28;
  guide.getColumn(2).width = 72;

  const outDir = join(root, "public", "samples");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "contoh-import-penjualan-COSTA.xlsx");
  const buf = await wb.xlsx.writeBuffer();
  await writeFile(outPath, Buffer.from(buf));
  console.log("File contoh:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
