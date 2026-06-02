import { buildAndDownloadXlsx, buildStyledXlsxBuffer, downloadXlsxFile, type XlsxColumnDef } from "@/lib/export/xlsx";

type TemplateRowKey =
  | "mp_order_no"
  | "order_date"
  | "mp_buyer_name"
  | "mp_sku"
  | "product_name"
  | "mp_category"
  | "qty"
  | "unit_price";

const TEMPLATE_COLUMNS: XlsxColumnDef<TemplateRowKey>[] = [
  { header: "mp_order_no", key: "mp_order_no", width: 20, type: "text" },
  { header: "order_date", key: "order_date", width: 14, type: "date" },
  { header: "mp_buyer_name", key: "mp_buyer_name", width: 22, type: "text" },
  { header: "mp_sku", key: "mp_sku", width: 18, type: "text" },
  { header: "product_name", key: "product_name", width: 28, type: "text" },
  { header: "mp_category", key: "mp_category", width: 16, type: "text" },
  { header: "qty", key: "qty", width: 10, type: "integer" },
  { header: "unit_price", key: "unit_price", width: 14, type: "currency_idr" },
];

const SAMPLE_ROWS: Array<Record<TemplateRowKey, unknown>> = [
  {
    mp_order_no: "ORD-20260528-001",
    order_date: new Date(2026, 4, 28),
    mp_buyer_name: "Budi Santoso",
    mp_sku: "22344FGG56666",
    product_name: "COSTA CT-6218 Tripod",
    mp_category: "",
    qty: 2,
    unit_price: 250000,
  },
  {
    mp_order_no: "ORD-20260528-002",
    order_date: new Date(2026, 4, 28),
    mp_buyer_name: "Siti Aminah",
    mp_sku: "22344FGG56666",
    product_name: "COSTA CT-6218 Tripod",
    mp_category: "",
    qty: 1,
    unit_price: 250000,
  },
];

export async function downloadMpImportTemplateXlsx(): Promise<void> {
  await buildAndDownloadXlsx({
    sheetName: "Penjualan",
    filename: "template-import-penjualan-mp.xlsx",
    columns: TEMPLATE_COLUMNS,
    rows: SAMPLE_ROWS,
  });
}

export async function buildMpImportTemplateXlsxBuffer(): Promise<ArrayBuffer> {
  return buildStyledXlsxBuffer({
    sheetName: "Penjualan",
    columns: TEMPLATE_COLUMNS,
    rows: SAMPLE_ROWS,
  });
}

export { downloadXlsxFile };
