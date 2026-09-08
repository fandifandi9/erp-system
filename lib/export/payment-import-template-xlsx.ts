import { PAYMENT_IMPORT_TEMPLATE_COLUMNS } from "@/lib/bisnis/payment-import-schema";
import { buildAndDownloadXlsx, type XlsxColumnDef } from "@/lib/export/xlsx";

function buildColumns(): XlsxColumnDef<string>[] {
  return PAYMENT_IMPORT_TEMPLATE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    type:
      c.key === "payment_date"
        ? "date"
        : c.key === "amount"
          ? "currency_idr"
          : "text",
  }));
}

const sampleRows: Record<string, unknown>[] = [
  {
    invoice_no: "INV090726-0001",
    payment_date: new Date(2026, 5, 1),
    amount: 500000,
    metode_bayar: "Transfer Bank",
    reference_no: "TRF-20260601-001",
    notes: "Pelunasan sebagian",
    lunas_penuh: "T",
  },
  {
    invoice_no: "INV090726-0002",
    payment_date: new Date(2026, 5, 1),
    amount: 0,
    metode_bayar: "Kas",
    reference_no: "",
    notes: "Lunas penuh — isi lunas_penuh Y, jumlah boleh 0",
    lunas_penuh: "Y",
  },
];

export async function downloadPaymentImportTemplateXlsx(): Promise<void> {
  await buildAndDownloadXlsx({
    sheetName: "Pelunasan",
    filename: "template-import-pelunasan.xlsx",
    columns: buildColumns(),
    rows: sampleRows,
  });
}
