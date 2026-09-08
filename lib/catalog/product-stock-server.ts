import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import {
  isDamagedWarehouse,
  isSalesWarehouse,
  resolveWarehouseKind,
  WAREHOUSE_KIND_LABELS,
  type WarehouseKind,
} from "@/lib/bisnis/warehouse-categories";
import { canonicalEntityWarehouses } from "@/lib/inventory/transfer-suggest";
import { cachedFetch, invalidateStockCache } from "@/lib/catalog/stock-cache";
import { getCatalogPb } from "@/lib/catalog/api-server";
import type {
  ProductStockKindSummary,
  ProductStockOverview,
  ProductStockTotals,
  ProductWarehouseStockRow,
} from "@/lib/catalog/product-stock-types";

type WarehouseRecord = {
  id: string;
  code: string;
  name: string;
  company?: string;
  store?: string;
  is_active?: boolean;
  warehouse_role?: string;
};

type CompanyRecord = { id: string; company_name?: string; is_active?: boolean };
type StoreRecord = { id: string; name?: string; company?: string };

function hasStock(t: { onHand: number; available: number; reserved: number }): boolean {
  return t.onHand !== 0 || t.available !== 0 || t.reserved !== 0;
}

function buildStockedByKind(rows: ProductWarehouseStockRow[]): ProductStockKindSummary[] {
  const kinds: WarehouseKind[] = ["entity", "sales", "transit", "damaged"];
  return kinds
    .map((kind) => ({
      kind,
      label: WAREHOUSE_KIND_LABELS[kind],
      items: rows
        .filter((r) => r.kind === kind && hasStock(r))
        .map((r) => ({
          code: r.code,
          name: r.name,
          companyName: r.companyName,
          qty: r.onHand,
        })),
    }))
    .filter((g) => g.items.length > 0);
}

async function loadWarehouses(pb: PocketBase, fields?: string): Promise<WarehouseRecord[]> {
  return cachedFetch(`warehouses:${fields ?? "full"}`, () =>
    pb.collection(INV_COLLECTIONS.warehouses).getFullList<WarehouseRecord>({
      sort: "code",
      fields: fields ?? undefined,
      requestKey: null,
    }),
  );
}

async function loadActiveCompanies(pb: PocketBase): Promise<CompanyRecord[]> {
  return cachedFetch("companies:active", () =>
    pb
      .collection(BISNIS_COLLECTIONS.companyProfile)
      .getFullList<CompanyRecord>({
        sort: "company_name",
        filter: "is_active = true",
        fields: "id,company_name,is_active",
        requestKey: null,
      })
      .catch(() => [] as CompanyRecord[]),
  );
}

async function loadStores(pb: PocketBase): Promise<StoreRecord[]> {
  return cachedFetch("stores:all", () =>
    pb
      .collection(BISNIS_COLLECTIONS.stores)
      .getFullList<StoreRecord>({
        fields: "id,name,company",
        requestKey: null,
      })
      .catch(() => [] as StoreRecord[]),
  );
}

function buildOverview(
  warehouses: WarehouseRecord[],
  balanceRes: Array<Record<string, unknown>>,
  companies: CompanyRecord[],
  stores: StoreRecord[],
): ProductStockOverview {
  const activeCompanyIds = new Set(companies.map((c) => c.id));
  const companyNameById = new Map(companies.map((c) => [c.id, c.company_name ?? c.id]));
  const storeNameById = new Map(stores.map((s) => [s.id, s.name ?? s.id]));

  const storeRows = stores.map((s) => ({ id: s.id, name: s.name, company: s.company }));
  const whRows = warehouses.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    company: w.company,
    store: w.store,
    warehouse_role: w.warehouse_role,
    is_active: w.is_active,
  }));

  const canonicalEntityIds = new Set(
    canonicalEntityWarehouses(whRows, undefined, storeRows).map((w) => w.id),
  );

  const activeWarehouses = warehouses.filter((w) => {
    if (w.is_active === false) return false;
    const cid = w.company || (w.store ? stores.find((s) => s.id === w.store)?.company : undefined);
    if (cid && !activeCompanyIds.has(cid)) return false;
    if (resolveWarehouseKind(w) === "entity" && !canonicalEntityIds.has(w.id)) return false;
    return true;
  });

  const totalsByWarehouse: Record<string, { onHand: number; available: number; reserved: number }> =
    {};

  for (const row of balanceRes) {
    const whId = String(row.warehouse ?? "");
    if (!whId) continue;
    if (!totalsByWarehouse[whId]) {
      totalsByWarehouse[whId] = { onHand: 0, available: 0, reserved: 0 };
    }
    totalsByWarehouse[whId].onHand += Number(row.qty_on_hand) || 0;
    totalsByWarehouse[whId].available += Number(row.qty_available) || 0;
    totalsByWarehouse[whId].reserved += Number(row.qty_reserved) || 0;
  }

  const rows: ProductWarehouseStockRow[] = activeWarehouses.map((wh) => {
    const kind = resolveWarehouseKind(wh);
    const totals = totalsByWarehouse[wh.id] ?? { onHand: 0, available: 0, reserved: 0 };
    const companyId = wh.company || (wh.store ? stores.find((s) => s.id === wh.store)?.company : undefined);
    return {
      warehouseId: wh.id,
      code: wh.code,
      name: wh.name,
      kind,
      kindLabel: WAREHOUSE_KIND_LABELS[kind],
      companyId,
      companyName: companyId ? companyNameById.get(companyId) : undefined,
      storeId: wh.store,
      storeName: wh.store ? storeNameById.get(wh.store) : undefined,
      isPrimaryEntity: kind === "entity" && wh.warehouse_role === "main",
      onHand: totals.onHand,
      available: totals.available,
      reserved: totals.reserved,
    };
  });

  rows.sort((a, b) => {
    const aStock = hasStock(a);
    const bStock = hasStock(b);
    if (aStock !== bStock) return aStock ? -1 : 1;
    const kindOrder: WarehouseKind[] = ["entity", "sales", "transit", "damaged"];
    const ki = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
    if (ki !== 0) return ki;
    return a.code.localeCompare(b.code);
  });

  const entityWarehouses = rows
    .filter((r) => r.kind === "entity")
    .map((r) => ({
      companyName: r.companyName ?? "—",
      code: r.code,
      name: r.name,
      qty: r.onHand,
    }));

  const operationalRows = rows.filter((r) => r.kind !== "damaged");
  const salesRows = rows.filter((r) => r.kind === "sales");
  const damagedRows = rows.filter((r) => r.kind === "damaged");

  return {
    rows,
    stockedByKind: buildStockedByKind(rows),
    entityWarehouses,
    totalOnHand: operationalRows.reduce((s, r) => s + r.onHand, 0),
    totalAvailable: operationalRows.reduce((s, r) => s + r.available, 0),
    totalReserved: operationalRows.reduce((s, r) => s + r.reserved, 0),
    sellableOnHand: salesRows.reduce((s, r) => s + r.onHand, 0),
    sellableAvailable: salesRows.reduce((s, r) => s + r.available, 0),
    damagedOnHand: damagedRows.reduce((s, r) => s + r.onHand, 0),
  };
}

export async function getProductStockOverviewServer(
  productId: string,
  fresh = false,
): Promise<ProductStockOverview> {
  if (fresh) invalidateStockCache(`overview:${productId}`);
  const pb = await getCatalogPb();
  return cachedFetch(
    `overview:${productId}`,
    async () => {
      const [warehouses, balanceRes, companies, stores] = await Promise.all([
        loadWarehouses(pb, "id,code,name,company,store,is_active,warehouse_role"),
        pb.collection(INV_COLLECTIONS.balances).getFullList({
          filter: `product = "${productId.replace(/"/g, '\\"')}"`,
          fields: "warehouse,qty_on_hand,qty_available,qty_reserved",
          requestKey: null,
        }),
        loadActiveCompanies(pb),
        loadStores(pb),
      ]);
      return buildOverview(warehouses, balanceRes, companies, stores);
    },
    20_000,
  );
}

export async function getProductsStockTotalsServer(productIds: string[]): Promise<ProductStockTotals> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) return { global: {}, sellable: {} };

  const pb = await getCatalogPb();
  const filter = uniqueIds.map((id) => `product = "${id.replace(/"/g, '\\"')}"`).join(" || ");

  const [warehouses, balances] = await Promise.all([
    loadWarehouses(pb, "id,is_active,warehouse_role,store"),
    pb.collection(INV_COLLECTIONS.balances).getFullList({
      filter,
      fields: "product,warehouse,qty_on_hand",
      requestKey: null,
    }),
  ]);

  const globalWh = new Set(
    warehouses.filter((w) => w.is_active !== false && !isDamagedWarehouse(w)).map((w) => w.id),
  );
  const salesWh = new Set(
    warehouses.filter((w) => w.is_active !== false && isSalesWarehouse(w)).map((w) => w.id),
  );

  const global: Record<string, number> = {};
  const sellable: Record<string, number> = {};
  for (const id of uniqueIds) {
    global[id] = 0;
    sellable[id] = 0;
  }

  for (const row of balances) {
    const productId = String(row.product ?? "");
    const warehouseId = String(row.warehouse ?? "");
    const qty = Number(row.qty_on_hand) || 0;
    if (!productId || !warehouseId) continue;
    if (globalWh.has(warehouseId)) global[productId] = (global[productId] ?? 0) + qty;
    if (salesWh.has(warehouseId) && qty > 0) sellable[productId] = (sellable[productId] ?? 0) + qty;
  }

  return { global, sellable };
}
