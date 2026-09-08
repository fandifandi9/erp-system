/** Skema kolom Excel import penjualan — selaras dengan form Buat Penjualan / SO. */

export type ImportOrderHeader = {
  toko: string;
  pelanggan: string;
  email?: string;
  no_so?: string;
  no_referensi?: string;
  tgl_transaksi: string;
  jatuh_tempo?: string;
  term?: string;
  metode_bayar?: string;
  lewat_wms?: boolean;
  pesan?: string;
  memo?: string;
  harga_termasuk_ppn?: boolean;
  ppn_persen?: number;
  diskon_order?: number;
  diskon_order_tipe?: "persen" | "nominal";
  materai?: number;
  mp_order_no: string;
  pembeli_mp?: string;
  ekspedisi?: string;
  no_resi?: string;
  ongkir?: number;
  alamat_kirim?: string;
};

export type ParsedImportRow = {
  rowNo: number;
  header: ImportOrderHeader;
  mp_sku: string;
  product_name?: string;
  catatan_baris?: string;
  qty: number;
  unit?: string;
  unit_price: number;
  discount_percent: number;
  gross_amount: number;
};

export const IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
  toko: ["toko", "store", "nama_toko", "store_name", "warehouse", "gudang"],
  pelanggan: ["pelanggan", "customer", "nama_pelanggan", "customer_name", "nama_customer"],
  email: ["email", "customer_email", "email_pelanggan"],
  no_so: ["no_so", "so_no", "transaction_no", "nomor_so"],
  no_referensi: ["no_referensi", "referensi", "ref_no", "customer_ref", "no_pesanan_mp"],
  tgl_transaksi: ["tgl_transaksi", "order_date", "tanggal", "invoice_date", "tgl_order"],
  jatuh_tempo: ["jatuh_tempo", "due_date", "tanggal_jatuh_tempo"],
  term: ["term", "payment_term", "syarat_bayar"],
  metode_bayar: ["metode_bayar", "payment_method", "metode_pembayaran"],
  lewat_wms: ["lewat_wms", "send_to_warehouse", "wms", "lewat_gudang"],
  pesan: ["pesan", "message", "catatan_pesan"],
  memo: ["memo", "catatan_internal"],
  harga_termasuk_ppn: ["harga_termasuk_ppn", "include_tax", "termasuk_ppn"],
  ppn_persen: ["ppn_persen", "tax_percent", "pajak_persen", "tax_rate"],
  diskon_order: ["diskon_order", "order_discount", "diskon_total"],
  diskon_order_tipe: ["diskon_order_tipe", "order_discount_type", "tipe_diskon_order"],
  materai: ["materai", "biaya_materai"],
  mp_order_no: ["mp_order_no", "no_pesanan", "order_no", "invoice_number", "nomor_pesanan"],
  pembeli_mp: ["pembeli_mp", "mp_buyer_name", "buyer_name", "nama_pembeli", "penerima"],
  ekspedisi: ["ekspedisi", "ship_via", "courier", "kurir"],
  no_resi: ["no_resi", "tracking_no", "nomor_resi", "tracking"],
  ongkir: ["ongkir", "shipping_fee", "shipping_cost", "biaya_kirim"],
  alamat_kirim: ["alamat_kirim", "shipping_address", "alamat_penerima", "recipient_address"],
  mp_sku: ["mp_sku", "sku", "kode_produk", "seller_sku", "product_sku"],
  nama_produk: ["nama_produk", "product_name", "nama_produk"],
  catatan_baris: ["catatan_baris", "line_note", "catatan", "description"],
  qty: ["qty", "quantity", "jumlah", "kuantitas"],
  unit: ["unit", "satuan"],
  harga_satuan: ["harga_satuan", "unit_price", "harga", "price"],
  diskon_baris_pct: ["diskon_baris_pct", "line_discount", "diskon", "discount_percent"],
};

/** Urutan kolom di template Excel (header baris 1). */
export const IMPORT_TEMPLATE_COLUMNS = [
  { key: "toko", header: "toko (*)", width: 14 },
  { key: "pelanggan", header: "pelanggan (*)", width: 22 },
  { key: "email", header: "email", width: 22 },
  { key: "no_so", header: "no_so", width: 16 },
  { key: "no_referensi", header: "no_referensi", width: 18 },
  { key: "tgl_transaksi", header: "tgl_transaksi (*)", width: 14 },
  { key: "jatuh_tempo", header: "jatuh_tempo", width: 14 },
  { key: "term", header: "term", width: 14 },
  { key: "metode_bayar", header: "metode_bayar", width: 16 },
  { key: "lewat_wms", header: "lewat_wms (Y/T)", width: 12 },
  { key: "pesan", header: "pesan", width: 20 },
  { key: "memo", header: "memo", width: 18 },
  { key: "harga_termasuk_ppn", header: "harga_termasuk_ppn (Y/T)", width: 14 },
  { key: "ppn_persen", header: "ppn_persen", width: 10 },
  { key: "diskon_order", header: "diskon_order", width: 12 },
  { key: "diskon_order_tipe", header: "diskon_order_tipe (persen/nominal)", width: 18 },
  { key: "materai", header: "materai", width: 12 },
  { key: "mp_order_no", header: "mp_order_no (*)", width: 20 },
  { key: "pembeli_mp", header: "pembeli_mp", width: 20 },
  { key: "ekspedisi", header: "ekspedisi", width: 14 },
  { key: "no_resi", header: "no_resi", width: 16 },
  { key: "ongkir", header: "ongkir", width: 12 },
  { key: "alamat_kirim", header: "alamat_kirim", width: 28 },
  { key: "mp_sku", header: "mp_sku (*)", width: 18 },
  { key: "nama_produk", header: "nama_produk", width: 28 },
  { key: "catatan_baris", header: "catatan_baris", width: 18 },
  { key: "qty", header: "qty (*)", width: 8 },
  { key: "unit", header: "unit", width: 8 },
  { key: "harga_satuan", header: "harga_satuan (*)", width: 14 },
  { key: "diskon_baris_pct", header: "diskon_baris_pct", width: 12 },
] as const;

export const IMPORT_TEMPLATE_HEADER_KEYS = IMPORT_TEMPLATE_COLUMNS.map((c) => c.key);

export function parseYesNo(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "y" || s === "yes" || s === "ya" || s === "1" || s === "true" || s === "t";
}

export function parseDiscountType(v: string): "persen" | "nominal" {
  const s = v.trim().toLowerCase();
  if (s === "nominal" || s === "amount" || s === "rp") return "nominal";
  return "persen";
}
