import { IMPORT_TEMPLATE_COLUMNS } from "@/lib/bisnis/mp-import-schema";
import { buildFullSampleImportRows } from "@/lib/export/mp-import-sample-rows";
import { buildAndDownloadXlsx, buildStyledXlsxBuffer, downloadXlsxFile, type XlsxColumnDef } from "@/lib/export/xlsx";
import ExcelJS from "exceljs";

export type MpImportTemplateOpts = {
  storeName: string;
  /** Nama pelanggan contoh — harus ada di master Kontak atau ganti saat isi. */
  sampleCustomer?: string;
};

function buildColumns(): XlsxColumnDef<string>[] {
  return IMPORT_TEMPLATE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    type:
      c.key === "tgl_transaksi" || c.key === "jatuh_tempo"
        ? "date"
        : c.key === "qty" || c.key === "ppn_persen" || c.key === "diskon_baris_pct" || c.key === "diskon_order" || c.key === "materai" || c.key === "ongkir"
          ? "integer"
          : c.key === "harga_satuan"
            ? "currency_idr"
            : "text",
  }));
}

async function appendPetunjukSheet(wb: ExcelJS.Workbook): Promise<void> {
  const ws = wb.addWorksheet("Petunjuk");
  ws.columns = [
    { header: "Langkah / Kolom", key: "a", width: 28 },
    { header: "Keterangan", key: "b", width: 72 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true };
  const lines: [string, string][] = [
    ["1. Pilih toko", "Saat upload di SERBA, pilih toko yang namanya sama dengan kolom toko (*)."],
    ["2. Kontak", "Nama di kolom pelanggan (*) harus sudah ada di menu Kontak."],
    ["3. SKU produk", "Kolom mp_sku (*) harus sama persis dengan SKU di Katalog Produk."],
    ["4. Satu order = banyak baris", "Ulangi mp_order_no & header order; bedakan hanya baris produk."],
    ["5. Posting", "Setelah upload: validasi batch → posting → SO & invoice terbentuk."],
    ["", ""],
    ["Kolom wajib (*)", "toko, pelanggan, tgl_transaksi, mp_order_no, mp_sku, qty, harga_satuan"],
    ["lewat_wms T/Y", "Order masuk antrean gudang (WMS) dulu"],
    ["lewat_wms F/N", "Langsung SO + invoice tanpa antrean WMS"],
  ];
  for (const [a, b] of lines) ws.addRow({ a, b });
}

export async function buildMpImportSampleXlsxBuffer(opts: MpImportTemplateOpts): Promise<ArrayBuffer> {
  const columns = buildColumns();
  const rows = buildFullSampleImportRows(opts.storeName.trim() || "COSTA");
  const buffer = await buildStyledXlsxBuffer({
    sheetName: "Penjualan",
    columns,
    rows,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  await appendPetunjukSheet(wb);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadMpImportTemplateXlsx(opts: MpImportTemplateOpts): Promise<void> {
  if (!opts.storeName.trim()) {
    throw new Error("Pilih toko dulu sebelum unduh template Excel.");
  }
  const buffer = await buildMpImportSampleXlsxBuffer(opts);
  downloadXlsxFile(
    buffer,
    `template-penjualan-${opts.storeName.trim().replace(/\s+/g, "-")}.xlsx`,
  );
}

export async function buildMpImportTemplateXlsxBuffer(opts: MpImportTemplateOpts): Promise<ArrayBuffer> {
  return buildMpImportSampleXlsxBuffer(opts);
}

export { downloadXlsxFile };
