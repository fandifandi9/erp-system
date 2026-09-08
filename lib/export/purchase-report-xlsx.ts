import { buildAndDownloadXlsx, type XlsxColumnDef } from "@/lib/export/xlsx";

export type PurchaseOrderExportRow = {
  order_date: string | Date;
  po_no: string;
  supplier_name: string;
  status: string;
  total: number;
};

type PurchaseRowKey = "order_date" | "po_no" | "supplier_name" | "status" | "total";

const PURCHASE_COLUMNS: XlsxColumnDef<PurchaseRowKey>[] = [
  { header: "Tanggal", key: "order_date", width: 14, type: "date" },
  { header: "No. PO", key: "po_no", width: 18, type: "text" },
  { header: "Pemasok", key: "supplier_name", width: 28, type: "text" },
  { header: "Status", key: "status", width: 14, type: "text" },
  { header: "Total", key: "total", width: 16, type: "currency_idr" },
];

export async function downloadPurchaseReportXlsx(
  rows: PurchaseOrderExportRow[],
  filename?: string
): Promise<void> {
  const year = new Date().getFullYear();
  await buildAndDownloadXlsx({
    sheetName: "Pembelian",
    filename: filename ?? `laporan-pembelian-${year}.xlsx`,
    columns: PURCHASE_COLUMNS,
    rows: rows as Array<Record<PurchaseRowKey, unknown>>,
  });
}
