/** Skema Excel import pelunasan invoice penjualan. */

export type ParsedPaymentImportRow = {
  rowNo: number;
  invoice_no: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_no?: string;
  notes?: string;
  /** Y/T — jika ya, jumlah = sisa tagihan (abaikan kolom jumlah jika perlu) */
  lunas_penuh?: boolean;
};

export const PAYMENT_IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
  invoice_no: [
    "no_invoice",
    "invoice_no",
    "nomor_invoice",
    "inv",
    "no_inv",
    "invoice_number",
  ],
  payment_date: ["tgl_pembayaran", "payment_date", "tanggal", "tanggal_bayar", "tgl_bayar"],
  amount: ["jumlah", "amount", "nominal", "bayar", "jumlah_bayar"],
  payment_method: ["metode_bayar", "payment_method", "metode_pembayaran", "cara_bayar"],
  reference_no: ["no_referensi", "reference_no", "ref", "no_ref", "bukti_transfer"],
  notes: ["catatan", "notes", "keterangan", "memo"],
  lunas_penuh: ["lunas_penuh", "pelunasan_penuh", "full_payment", "lunas"],
};

export const PAYMENT_IMPORT_TEMPLATE_COLUMNS = [
  { key: "invoice_no", header: "no_invoice (*)", width: 18 },
  { key: "payment_date", header: "tgl_pembayaran (*)", width: 14 },
  { key: "amount", header: "jumlah (*)", width: 14 },
  { key: "metode_bayar", header: "metode_bayar (*)", width: 16 },
  { key: "reference_no", header: "no_referensi", width: 18 },
  { key: "notes", header: "catatan", width: 22 },
  { key: "lunas_penuh", header: "lunas_penuh (Y/T)", width: 12 },
] as const;
