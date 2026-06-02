import { buildAndDownloadXlsx, type XlsxColumnDef } from "@/lib/export/xlsx";

export type SalesInvoiceExportRow = {
  issue_date: string | Date;
  invoice_no: string;
  customer_name: string;
  status_label: string;
  total: number | null;
};

type SalesRowKey = "issue_date" | "invoice_no" | "customer_name" | "status_label" | "total";

const SALES_COLUMNS: XlsxColumnDef<SalesRowKey>[] = [
  { header: "Tanggal", key: "issue_date", width: 14, type: "date" },
  { header: "No. Invoice", key: "invoice_no", width: 18, type: "text" },
  { header: "Pelanggan", key: "customer_name", width: 28, type: "text" },
  { header: "Status", key: "status_label", width: 14, type: "text" },
  { header: "Total", key: "total", width: 16, type: "currency_idr" },
];

export async function downloadSalesReportXlsx(
  rows: SalesInvoiceExportRow[],
  filename?: string
): Promise<void> {
  const year = new Date().getFullYear();
  await buildAndDownloadXlsx({
    sheetName: "Penjualan",
    filename: filename ?? `laporan-penjualan-${year}.xlsx`,
    columns: SALES_COLUMNS,
    rows: rows as Array<Record<SalesRowKey, unknown>>,
  });
}
