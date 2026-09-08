import type { CatalogProduct, CatalogViewRole } from "./types";

const COMMERCIAL_FIELDS = ["sell_price", "buy_price"] as const;
const FINANCE_FIELDS = ["buy_price"] as const;

export type CatalogFieldVisibility = {
  showPrices: boolean;
  showBuyPrice: boolean;
  showMargin: boolean;
  showSellPrice: boolean;
  editPrices: boolean;
  editLogistics: boolean;
  editIdentity: boolean;
};

export function getCatalogFieldVisibility(role: CatalogViewRole): CatalogFieldVisibility {
  switch (role) {
    case "owner":
    case "commercial":
      return {
        showPrices: true,
        showBuyPrice: true,
        showMargin: true,
        showSellPrice: true,
        editPrices: true,
        editLogistics: true,
        editIdentity: true,
      };
    case "finance":
      return {
        showPrices: true,
        showBuyPrice: true,
        showMargin: true,
        showSellPrice: true,
        editPrices: false,
        editLogistics: false,
        editIdentity: false,
      };
    case "warehouse":
    default:
      return {
        showPrices: false,
        showBuyPrice: false,
        showMargin: false,
        showSellPrice: false,
        editPrices: false,
        editLogistics: true,
        editIdentity: true,
      };
  }
}

export function stripProductForRole(
  product: CatalogProduct,
  role: CatalogViewRole,
): CatalogProduct {
  const vis = getCatalogFieldVisibility(role);
  const out = { ...product };
  if (!vis.showSellPrice) {
    delete out.sell_price;
  }
  if (!vis.showBuyPrice) {
    delete out.buy_price;
  }
  return out;
}

export function stripProductListForRole<T extends CatalogProduct>(
  items: T[],
  role: CatalogViewRole,
): T[] {
  return items.map((p) => stripProductForRole(p, role) as T);
}

export function resolveRelationLabel(
  id: string | undefined,
  expanded: { name?: string } | undefined,
  options: Array<{ id: string; name: string }>,
): string {
  if (expanded?.name) return expanded.name;
  if (!id) return "—";
  return options.find((o) => o.id === id)?.name ?? "—";
}

export function pickWritableProductFields(
  body: Record<string, unknown>,
  role: CatalogViewRole,
): Record<string, unknown> {
  const vis = getCatalogFieldVisibility(role);
  const allowed = new Set<string>([
    "sku",
    "name",
    "barcode",
    "description",
    "uom",
    "category",
    "brand",
    "image",
  ]);
  if (vis.editLogistics) {
    allowed.add("min_stock");
    allowed.add("requires_serial");
  }
  if (vis.editPrices) {
    for (const f of COMMERCIAL_FIELDS) allowed.add(f);
  }
  if (role === "owner" || role === "commercial") {
    allowed.add("product_type");
    allowed.add("lifecycle_status");
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}
