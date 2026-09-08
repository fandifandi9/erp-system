import {
  resolveWarehouseKind,
  WAREHOUSE_KIND_LABELS,
  type WarehouseKind,
} from "@/lib/bisnis/warehouse-categories";

export type TransferWarehouseRow = {
  id: string;
  code: string;
  name: string;
  company?: string;
  store?: string;
  warehouse_role?: string;
  is_active?: boolean;
};

export type TransferStoreRow = {
  id: string;
  name?: string;
  company?: string;
};

export type TransferScenario = "in" | "out" | "barter";

export const TRANSFER_SCENARIOS: {
  id: TransferScenario;
  label: string;
  hint: string;
}[] = [
  {
    id: "in",
    label: "In",
    hint: "Gudang entitas → gudang penjualan (toko / POS)",
  },
  {
    id: "out",
    label: "Out",
    hint: "Entitas atau toko → gudang rusak atau sementara",
  },
  {
    id: "barter",
    label: "Barter",
    hint: "Gudang toko → gudang toko (satu entitas)",
  },
];

function kindOf(w: TransferWarehouseRow): WarehouseKind {
  return resolveWarehouseKind(w);
}

function storeMap(stores: TransferStoreRow[]): Map<string, TransferStoreRow> {
  return new Map(stores.map((s) => [s.id, s]));
}

export function warehouseCompanyId(
  w: TransferWarehouseRow,
  stores: TransferStoreRow[],
): string | undefined {
  if (w.company) return w.company;
  if (w.store) return storeMap(stores).get(w.store)?.company;
  return undefined;
}

/** Semua gudang entitas aktif — termasuk yang terikat toko (via store.company). */
export function filterWarehousesForCompany(
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
): TransferWarehouseRow[] {
  const active = warehouses.filter((w) => w.is_active !== false);
  if (!companyId) return active;

  const storeIds = new Set(stores.filter((s) => s.company === companyId).map((s) => s.id));
  return active.filter(
    (w) => w.company === companyId || (w.store && storeIds.has(w.store)),
  );
}

function scoped(
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
): TransferWarehouseRow[] {
  return filterWarehousesForCompany(warehouses, companyId, stores);
}

function byKind(
  warehouses: TransferWarehouseRow[],
  kind: WarehouseKind,
): TransferWarehouseRow[] {
  return warehouses.filter((w) => kindOf(w) === kind);
}

/** Satu gudang entitas kanonik per entitas — utamakan role main, hindari duplikat legacy. */
export function canonicalEntityWarehouses(
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
): TransferWarehouseRow[] {
  const entities = byKind(scoped(warehouses, companyId, stores), "entity");
  const byCompany = new Map<string, TransferWarehouseRow[]>();

  for (const w of entities) {
    const cid = warehouseCompanyId(w, stores);
    if (!cid) continue;
    const bucket = byCompany.get(cid) ?? [];
    bucket.push(w);
    byCompany.set(cid, bucket);
  }

  const picked: TransferWarehouseRow[] = [];
  for (const group of byCompany.values()) {
    const main = group.find((w) => w.warehouse_role === "main");
    if (main) {
      picked.push(main);
      continue;
    }
    group.sort((a, b) => a.code.localeCompare(b.code));
    if (group[0]) picked.push(group[0]);
  }

  return picked.sort((a, b) => a.code.localeCompare(b.code));
}

export function warehouseSelectLabel(
  w: TransferWarehouseRow,
  stores: TransferStoreRow[] = [],
  entityLabel?: string,
): string {
  const kind = WAREHOUSE_KIND_LABELS[kindOf(w)];
  const storeName = w.store ? storeMap(stores).get(w.store)?.name : undefined;
  const suffix = storeName ? ` · ${storeName}` : "";
  const prefix = entityLabel ? `${entityLabel} · ` : "";
  return `${prefix}${w.code} — ${w.name}${suffix} (${kind})`;
}

export function groupWarehousesByKind(
  warehouses: TransferWarehouseRow[],
): { kind: WarehouseKind; label: string; items: TransferWarehouseRow[] }[] {
  const order: WarehouseKind[] = ["entity", "transit", "damaged", "sales"];
  return order
    .map((kind) => ({
      kind,
      label: WAREHOUSE_KIND_LABELS[kind],
      items: warehouses.filter((w) => kindOf(w) === kind),
    }))
    .filter((g) => g.items.length > 0);
}

export function fromOptionsForScenario(
  scenario: TransferScenario,
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
): TransferWarehouseRow[] {
  const list = scoped(warehouses, companyId, stores);
  switch (scenario) {
    case "in":
      return canonicalEntityWarehouses(warehouses, companyId, stores);
    case "out":
      return [
        ...canonicalEntityWarehouses(warehouses, companyId, stores),
        ...byKind(scoped(warehouses, companyId, stores), "sales"),
      ];
    case "barter":
      return byKind(list, "sales");
  }
}

export function toOptionsForScenario(
  scenario: TransferScenario,
  warehouses: TransferWarehouseRow[],
  fromId: string,
  companyId?: string,
  stores: TransferStoreRow[] = [],
): TransferWarehouseRow[] {
  const list = scoped(warehouses, companyId, stores);
  const from = list.find((w) => w.id === fromId);
  const fromCompany = from ? warehouseCompanyId(from, stores) : companyId;

  switch (scenario) {
    case "in": {
      const fromCo = from ? warehouseCompanyId(from, stores) : companyId;
      return byKind(list, "sales").filter((w) => {
        if (w.id === fromId) return false;
        if (!fromCo) return true;
        return warehouseCompanyId(w, stores) === fromCo;
      });
    }
    case "out":
      return list.filter(
        (w) =>
          w.id !== fromId &&
          (kindOf(w) === "damaged" || kindOf(w) === "transit") &&
          (!fromCompany || warehouseCompanyId(w, stores) === fromCompany),
      );
    case "barter": {
      if (!from) return [];
      const entity = warehouseCompanyId(from, stores) ?? companyId;
      return byKind(list, "sales").filter(
        (w) =>
          w.id !== fromId &&
          (!entity || warehouseCompanyId(w, stores) === entity),
      );
    }
  }
}

export function validateTransferScenario(
  scenario: TransferScenario,
  fromId: string,
  toId: string,
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
): string | null {
  if (!fromId || !toId) return "Pilih gudang asal dan tujuan.";
  if (fromId === toId) return "Gudang asal dan tujuan tidak boleh sama.";

  const fromOk = fromOptionsForScenario(scenario, warehouses, companyId, stores).some(
    (w) => w.id === fromId,
  );
  const toOk = toOptionsForScenario(scenario, warehouses, fromId, companyId, stores).some(
    (w) => w.id === toId,
  );

  if (!fromOk) return "Gudang asal tidak valid untuk skenario ini.";
  if (!toOk) return "Gudang tujuan tidak valid untuk skenario ini.";

  if (scenario === "barter") {
    const from = warehouses.find((w) => w.id === fromId);
    const to = warehouses.find((w) => w.id === toId);
    if (!from || !to) return "Gudang tidak ditemukan.";
    const c1 = warehouseCompanyId(from, stores);
    const c2 = warehouseCompanyId(to, stores);
    if (c1 && c2 && c1 !== c2) {
      return "Barter hanya antar gudang toko dalam entitas yang sama.";
    }
  }

  return null;
}

export function defaultPairForScenario(
  scenario: TransferScenario,
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
  preferWarehouseId?: string,
): { fromId: string; toId: string } {
  const fromOpts = fromOptionsForScenario(scenario, warehouses, companyId, stores);
  let fromId = "";

  if (scenario === "in" || scenario === "out") {
    fromId =
      fromOpts.find((w) => w.warehouse_role === "main")?.id ??
      fromOpts.find((w) => kindOf(w) === "entity")?.id ??
      fromOpts[0]?.id ??
      "";
  } else {
    fromId =
      (preferWarehouseId && fromOpts.some((w) => w.id === preferWarehouseId)
        ? preferWarehouseId
        : "") ||
      fromOpts[0]?.id ||
      "";
  }

  const toOpts = fromId
    ? toOptionsForScenario(scenario, warehouses, fromId, companyId, stores)
    : [];

  let toId = "";
  if (scenario === "in") {
    toId =
      (preferWarehouseId &&
      toOpts.some((w) => w.id === preferWarehouseId) &&
      preferWarehouseId !== fromId
        ? preferWarehouseId
        : "") ||
      toOpts[0]?.id ||
      "";
  } else if (scenario === "out") {
    toId =
      toOpts.find((w) => kindOf(w) === "damaged")?.id ??
      toOpts.find((w) => kindOf(w) === "transit")?.id ??
      toOpts[0]?.id ??
      "";
  } else {
    toId = toOpts.find((w) => w.id !== fromId)?.id ?? toOpts[0]?.id ?? "";
  }

  return { fromId, toId };
}

export function describeTransferPair(
  fromId: string,
  toId: string,
  warehouses: TransferWarehouseRow[],
): string | null {
  const from = warehouses.find((w) => w.id === fromId);
  const to = warehouses.find((w) => w.id === toId);
  if (!from || !to) return null;
  return `${WAREHOUSE_KIND_LABELS[kindOf(from)]} → ${WAREHOUSE_KIND_LABELS[kindOf(to)]}`;
}

/** Opsi gudang asal — semua gudang dalam scope (tanpa skenario). */
export function manualTransferFromOptions(
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
): TransferWarehouseRow[] {
  return scoped(warehouses, companyId, stores);
}

/** Opsi gudang tujuan — semua gudang dalam scope kecuali asal. */
export function manualTransferToOptions(
  warehouses: TransferWarehouseRow[],
  fromId: string,
  companyId?: string,
  stores: TransferStoreRow[] = [],
): TransferWarehouseRow[] {
  return scoped(warehouses, companyId, stores).filter((w) => w.id !== fromId);
}

export function validateManualTransfer(
  fromId: string,
  toId: string,
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
): string | null {
  if (!fromId || !toId) return "Pilih gudang asal dan tujuan.";
  if (fromId === toId) return "Gudang asal dan tujuan tidak boleh sama.";

  const list = scoped(warehouses, companyId, stores);
  if (!list.some((w) => w.id === fromId)) return "Gudang asal tidak valid.";
  if (!list.some((w) => w.id === toId)) return "Gudang tujuan tidak valid.";
  return null;
}

export function defaultManualTransferPair(
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
  preferWarehouseId?: string,
): { fromId: string; toId: string } {
  const list = scoped(warehouses, companyId, stores);
  const fromId =
    (preferWarehouseId && list.some((w) => w.id === preferWarehouseId) ? preferWarehouseId : "") ||
    list[0]?.id ||
    "";
  const toId = list.find((w) => w.id !== fromId)?.id ?? "";
  return { fromId, toId };
}

export function countScopedWarehouses(
  warehouses: TransferWarehouseRow[],
  companyId?: string,
  stores: TransferStoreRow[] = [],
): { total: number; entity: number; transit: number; damaged: number; sales: number } {
  const list = scoped(warehouses, companyId, stores);
  return {
    total: list.length,
    entity: canonicalEntityWarehouses(warehouses, companyId, stores).length,
    transit: byKind(list, "transit").length,
    damaged: byKind(list, "damaged").length,
    sales: byKind(list, "sales").length,
  };
}
