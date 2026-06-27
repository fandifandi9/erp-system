import { sellableProductsPbFilter, sellableProductsPbFilterFallback } from "./product-lifecycle";

/** Filter PB untuk produk operasional (PO, penerimaan) — aktif + draft. */
export function operationalProductsPbFilter(): string {
  return '(lifecycle_status = "active" || lifecycle_status = "draft")';
}

/** Filter PB untuk produk yang boleh dijual (SO, POS, MP). */
export function sellableProductsFilterWithFallback(): string {
  return `${sellableProductsPbFilter()} || (${sellableProductsPbFilterFallback()})`;
}

export async function fetchOperationalProductsPb<T extends Record<string, unknown>>(
  pb: { collection: (name: string) => { getFullList: (opts: object) => Promise<T[]> } },
  opts?: { sort?: string; expand?: string },
): Promise<T[]> {
  try {
    return (await pb.collection("inv_products").getFullList({
      sort: opts?.sort ?? "name",
      filter: operationalProductsPbFilter(),
      expand: opts?.expand,
      requestKey: null,
    })) as T[];
  } catch {
    return (await pb.collection("inv_products").getFullList({
      sort: opts?.sort ?? "name",
      filter: sellableProductsPbFilterFallback(),
      expand: opts?.expand,
      requestKey: null,
    })) as T[];
  }
}

export async function fetchSellableProductsPb<T extends Record<string, unknown>>(
  pb: { collection: (name: string) => { getFullList: (opts: object) => Promise<T[]> } },
  opts?: { sort?: string; expand?: string },
): Promise<T[]> {
  try {
    return (await pb.collection("inv_products").getFullList({
      sort: opts?.sort ?? "name",
      filter: sellableProductsPbFilter(),
      expand: opts?.expand,
      requestKey: null,
    })) as T[];
  } catch {
    return (await pb.collection("inv_products").getFullList({
      sort: opts?.sort ?? "name",
      filter: sellableProductsPbFilterFallback(),
      expand: opts?.expand,
      requestKey: null,
    })) as T[];
  }
}
