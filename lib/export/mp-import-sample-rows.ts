import type { ImportOrderHeader } from "@/lib/bisnis/mp-import-schema";

export type SampleImportRow = Record<string, string | number | Date>;

type LineSpec = {
  mp_sku: string;
  nama_produk: string;
  catatan_baris: string;
  qty: number;
  unit: string;
  harga_satuan: number;
  diskon_baris_pct: number;
};

type OrderSpec = {
  suffix: string;
  mp_order_no: string;
  pelanggan: string;
  email: string;
  pembeli_mp: string;
  no_so: string;
  no_referensi: string;
  lewat_wms: "Y" | "T" | "F" | "N";
  metode_bayar: string;
  term: string;
  pesan: string;
  memo: string;
  diskon_order: number;
  diskon_order_tipe: "persen" | "nominal";
  materai: number;
  ekspedisi: string;
  no_resi: string;
  ongkir: number;
  alamat_kirim: string;
  lines: LineSpec[];
};

const ORDERS: OrderSpec[] = [
  {
    suffix: "001",
    mp_order_no: "ORD-20260617-001",
    pelanggan: "defan",
    email: "defan@email.com",
    pembeli_mp: "Defan Pratama",
    no_so: "",
    no_referensi: "REF-SHOPEE-001",
    lewat_wms: "T",
    metode_bayar: "Transfer Bank",
    term: "Net 14",
    pesan: "Terima kasih sudah berbelanja",
    memo: "Import contoh — lewat WMS",
    diskon_order: 0,
    diskon_order_tipe: "persen",
    materai: 0,
    ekspedisi: "JNE Reguler",
    no_resi: "JX1234567890ID",
    ongkir: 18000,
    alamat_kirim: "Jl. Melati No. 8, RT 02 RW 05, Jakarta Selatan 12730",
    lines: [
      {
        mp_sku: "22344FGG56666",
        nama_produk: "COSTA CT-6218 Tripod",
        catatan_baris: "Warna hitam",
        qty: 2,
        unit: "pcs",
        harga_satuan: 475000,
        diskon_baris_pct: 0,
      },
    ],
  },
  {
    suffix: "002",
    mp_order_no: "ORD-20260617-002",
    pelanggan: "ajas",
    email: "ajas@email.com",
    pembeli_mp: "Ajas Wijaya",
    no_so: "",
    no_referensi: "REF-TOKPED-002",
    lewat_wms: "F",
    metode_bayar: "Cash",
    term: "Cash",
    pesan: "Mohon dikirim cepat",
    memo: "Import contoh — langsung (tanpa WMS)",
    diskon_order: 5,
    diskon_order_tipe: "persen",
    materai: 10000,
    ekspedisi: "AnterAja",
    no_resi: "AN9876543210",
    ongkir: 22000,
    alamat_kirim: "Perumahan Griya Asri Blok C12, Bekasi 17145",
    lines: [
      {
        mp_sku: "22344FGG56666",
        nama_produk: "COSTA CT-6218 Tripod",
        catatan_baris: "Item 1 dari 2",
        qty: 1,
        unit: "pcs",
        harga_satuan: 475000,
        diskon_baris_pct: 0,
      },
      {
        mp_sku: "22344FGG56666",
        nama_produk: "COSTA CT-6218 Tripod",
        catatan_baris: "Item 2 dari 2 — spare",
        qty: 1,
        unit: "pcs",
        harga_satuan: 475000,
        diskon_baris_pct: 10,
      },
    ],
  },
];

/** Baris contoh import — semua kolom template terisi (selaras invoice/SO). */
export function buildFullSampleImportRows(
  storeName: string,
  overrides?: { orders?: OrderSpec[] },
): SampleImportRow[] {
  const toko = storeName.trim() || "COSTA";
  const txDate = new Date(2026, 5, 17);
  const dueDate = new Date(2026, 6, 1);
  const rows: SampleImportRow[] = [];

  for (const order of overrides?.orders ?? ORDERS) {
    for (const line of order.lines) {
      rows.push({
        toko,
        pelanggan: order.pelanggan,
        email: order.email,
        no_so: order.no_so,
        no_referensi: order.no_referensi,
        tgl_transaksi: txDate,
        jatuh_tempo: dueDate,
        term: order.term,
        metode_bayar: order.metode_bayar,
        lewat_wms: order.lewat_wms,
        pesan: order.pesan,
        memo: order.memo,
        harga_termasuk_ppn: "T",
        ppn_persen: 11,
        diskon_order: order.diskon_order,
        diskon_order_tipe: order.diskon_order_tipe,
        materai: order.materai,
        mp_order_no: order.mp_order_no,
        pembeli_mp: order.pembeli_mp,
        ekspedisi: order.ekspedisi,
        no_resi: order.no_resi,
        ongkir: order.ongkir,
        alamat_kirim: order.alamat_kirim,
        mp_sku: line.mp_sku,
        nama_produk: line.nama_produk,
        catatan_baris: line.catatan_baris,
        qty: line.qty,
        unit: line.unit,
        harga_satuan: line.harga_satuan,
        diskon_baris_pct: line.diskon_baris_pct,
      });
    }
  }

  return rows;
}

export const SAMPLE_IMPORT_CHECKLIST: { kolom: string; wajib: boolean; keterangan: string }[] = [
  { kolom: "toko (*)", wajib: true, keterangan: "Harus sama persis dengan nama toko saat upload (mis. COSTA)" },
  { kolom: "pelanggan (*)", wajib: true, keterangan: "Nama harus sudah ada di menu Kontak" },
  { kolom: "tgl_transaksi (*)", wajib: true, keterangan: "Tanggal invoice / SO" },
  { kolom: "mp_order_no (*)", wajib: true, keterangan: "Nomor pesanan marketplace — unik per order" },
  { kolom: "mp_sku (*)", wajib: true, keterangan: "SKU di master produk (sama persis)" },
  { kolom: "qty (*)", wajib: true, keterangan: "Jumlah barang" },
  { kolom: "harga_satuan (*)", wajib: true, keterangan: "Harga per unit sebelum diskon baris" },
  { kolom: "email", wajib: false, keterangan: "Email pelanggan (opsional)" },
  { kolom: "jatuh_tempo", wajib: false, keterangan: "Tanggal jatuh tempo invoice" },
  { kolom: "metode_bayar", wajib: false, keterangan: "Harus cocok master Metode Bayar (Cash, Transfer Bank, …)" },
  { kolom: "lewat_wms", wajib: false, keterangan: "T/Y = antre gudang; F/N = langsung invoice" },
  { kolom: "pembeli_mp", wajib: false, keterangan: "Nama penerima di marketplace → tampil di invoice" },
  { kolom: "ekspedisi / no_resi / ongkir / alamat_kirim", wajib: false, keterangan: "Data pengiriman untuk invoice & WMS" },
  { kolom: "ppn_persen / materai / diskon_order", wajib: false, keterangan: "Pajak & diskon level order" },
];

export type { ImportOrderHeader };
