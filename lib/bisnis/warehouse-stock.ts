import {
  fetchStockMapByWarehouse,
  getStockQtyFromMap,
} from "@/lib/inventory/stock-balances";

/** @deprecated gunakan fetchStockMapByWarehouse — alias untuk modul bisnis */
export const fetchWarehouseStockMap = fetchStockMapByWarehouse;

export const getWarehouseStockQty = getStockQtyFromMap;
