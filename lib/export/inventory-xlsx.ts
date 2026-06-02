import { buildAndDownloadXlsx, type XlsxColumnDef } from "@/lib/export/xlsx";

export type InventoryStockExportRow = {
  sku: string;
  product_name: string;
  warehouse_code: string;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
};

type InventoryRowKey =
  | "sku"
  | "product_name"
  | "warehouse_code"
  | "qty_on_hand"
  | "qty_reserved"
  | "qty_available";

const INVENTORY_COLUMNS: XlsxColumnDef<InventoryRowKey>[] = [
  { header: "SKU", key: "sku", width: 16, type: "text" },
  { header: "Produk", key: "product_name", width: 32, type: "text" },
  { header: "Gudang", key: "warehouse_code", width: 12, type: "text" },
  { header: "Stok Fisik", key: "qty_on_hand", width: 14, type: "integer" },
  { header: "Reserved", key: "qty_reserved", width: 12, type: "integer" },
  { header: "Tersedia", key: "qty_available", width: 12, type: "integer" },
];

export async function downloadInventoryStockXlsx(
  rows: InventoryStockExportRow[],
  filename?: string
): Promise<void> {
  const stamp = new Date().toISOString().split("T")[0];
  await buildAndDownloadXlsx({
    sheetName: "Inventory",
    filename: filename ?? `stok-inventory-${stamp}.xlsx`,
    columns: INVENTORY_COLUMNS,
    rows: rows as Array<Record<InventoryRowKey, unknown>>,
  });
}
