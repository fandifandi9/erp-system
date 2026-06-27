import { resolveStoreForSalesDoc, resolveStoreForInvoice, resolveStoreForSalesOrder } from "./doc-share";
import type { Invoice, SalesOrder, Store } from "./types";
import { warehousesForStore } from "@/lib/tenant/warehouses-for-store";

type WarehouseRef = { id: string; name: string; code: string; store?: string };

function escFilter(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function warehouseIdsForStoreScope(
  storeId: string,
  stores: Store[],
  warehouses: WarehouseRef[],
): string[] {
  return warehousesForStore(storeId, stores, warehouses).map((w) => w.id);
}

/** Filter PB SO — store langsung atau gudang milik toko (data lama tanpa kolom store). */
export function buildSalesOrderStorePbFilter(
  storeId: string,
  stores: Store[],
  warehouses: WarehouseRef[],
): string {
  const parts = [`store = "${escFilter(storeId)}"`];
  for (const whId of warehouseIdsForStoreScope(storeId, stores, warehouses)) {
    parts.push(`warehouse = "${escFilter(whId)}"`);
  }
  return parts.length === 1 ? parts[0]! : `(${parts.join(" || ")})`;
}

/** Filter PB invoice — store invoice/SO atau gudang SO terkait. */
export function buildInvoiceStorePbFilter(
  storeId: string,
  stores: Store[],
  warehouses: WarehouseRef[],
): string {
  const parts = [
    `store = "${escFilter(storeId)}"`,
    `sales_order.store = "${escFilter(storeId)}"`,
  ];
  for (const whId of warehouseIdsForStoreScope(storeId, stores, warehouses)) {
    parts.push(`sales_order.warehouse = "${escFilter(whId)}"`);
  }
  return `(${parts.join(" || ")})`;
}

export function resolveInvoiceStoreName(inv: Invoice, stores: Store[]): string {
  if (inv.store) {
    const direct = stores.find((s) => s.id === inv.store);
    if (direct?.name) return direct.name;
  }
  const so = inv.expand?.sales_order;
  if (so?.store) {
    const fromSo = stores.find((s) => s.id === so.store);
    if (fromSo?.name) return fromSo.name;
  }
  return resolveStoreForInvoice(inv, stores)?.name ?? "—";
}

export function resolveSalesOrderStoreName(order: SalesOrder, stores: Store[]): string {
  if (order.store) {
    const direct = stores.find((s) => s.id === order.store);
    if (direct?.name) return direct.name;
  }
  return resolveStoreForSalesOrder(order, stores)?.name ?? "—";
}

/** Cocokkan dokumen ke toko aktif (untuk filter client-side cadangan). */
export function salesOrderMatchesStoreScope(
  order: SalesOrder,
  storeId: string,
  stores: Store[],
  warehouses: WarehouseRef[],
): boolean {
  if (!storeId) return true;
  if (order.store === storeId) return true;
  const whIds = new Set(warehouseIdsForStoreScope(storeId, stores, warehouses));
  if (order.warehouse && whIds.has(order.warehouse)) return true;
  return resolveStoreForSalesDoc(stores, order.warehouse)?.id === storeId;
}

export function invoiceMatchesStoreScope(
  inv: Invoice,
  storeId: string,
  stores: Store[],
  warehouses: WarehouseRef[],
): boolean {
  if (!storeId) return true;
  if (inv.store === storeId) return true;
  const so = inv.expand?.sales_order;
  if (so && salesOrderMatchesStoreScope(so, storeId, stores, warehouses)) return true;
  return resolveStoreForInvoice(inv, stores)?.id === storeId;
}
