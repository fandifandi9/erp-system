import { formatPosNotesForDisplay } from "@/lib/pos/meta";
import type { Invoice, SalesOrder, Store } from "@/lib/bisnis/types";

/** Ambil store_id dari SO, invoice, gudang, atau catatan POS. */
export function resolveStoreIdFromSalesOrder(
  so: SalesOrder,
  stores?: Pick<Store, "id" | "default_warehouse">[],
): string | undefined {
  if (so.store) return so.store;
  const notes = so.notes ?? "";
  const posDisplay = formatPosNotesForDisplay(notes);
  if (posDisplay) {
    const m = posDisplay.match(/store_id[=:]\s*([a-z0-9]+)/i) || notes.match(/"store_id"\s*:\s*"([^"]+)"/);
    if (m?.[1]) return m[1];
  }
  const jsonMatch = notes.match(/"store_id"\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) return jsonMatch[1];
  if (stores?.length && so.warehouse) {
    const fromWh = stores.find((s) => s.default_warehouse === so.warehouse);
    if (fromWh) return fromWh.id;
  }
  return undefined;
}

export function resolveStoreIdFromInvoice(
  inv: Pick<Invoice, "store" | "store_channel_account">,
  so?: SalesOrder | null,
  stores?: Pick<Store, "id" | "default_warehouse">[],
): string | undefined {
  if (inv.store) return inv.store;
  if (so) {
    const fromSo = resolveStoreIdFromSalesOrder(so, stores);
    if (fromSo) return fromSo;
  }
  if (inv.store_channel_account) return undefined;
  return undefined;
}
