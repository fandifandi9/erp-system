import type { InvProductPriceTier } from "@/lib/inventory/types";
import type { Store } from "@/lib/bisnis/types";
import { formatIntegerId } from "@/lib/format-number";

export type WholesaleTierRow = InvProductPriceTier & {
  storeId: string;
};

export function tierQtyRangeLabel(minQty: number, maxQty?: number | null): string {
  const min = Math.max(1, minQty);
  const max = maxQty && maxQty > 0 ? maxQty : min;
  if (max <= min) return formatIntegerId(min);
  return `${formatIntegerId(min)}–${formatIntegerId(max)}`;
}

export function tierQtyRangeLabelWithUnit(minQty: number, maxQty?: number | null, uom = "pcs"): string {
  const range = tierQtyRangeLabel(minQty, maxQty);
  const single = !maxQty || maxQty <= minQty;
  return single ? `${range} ${uom}` : range;
}

export function autoTierLabel(minQty: number, maxQty?: number | null): string {
  return tierQtyRangeLabel(minQty, maxQty);
}

export function groupWholesaleTiersByStore(
  stores: Store[],
  tiers: InvProductPriceTier[],
): Array<{ store: Store; tiers: WholesaleTierRow[] }> {
  const byStore = new Map<string, WholesaleTierRow[]>();
  for (const tier of tiers) {
    const storeId = tier.store;
    if (!storeId) continue;
    const list = byStore.get(storeId) ?? [];
    list.push({ ...tier, storeId });
    byStore.set(storeId, list);
  }

  return stores
    .filter((s) => s.is_active !== false)
    .map((store) => ({
      store,
      tiers: (byStore.get(store.id) ?? []).sort((a, b) => a.min_qty - b.min_qty),
    }))
    .sort((a, b) => a.store.name.localeCompare(b.store.name, "id"));
}
