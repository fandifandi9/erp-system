import { pb } from "@/lib/pocketbase";
import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { CashAccount, Store } from "./types";

export type WarehouseRole = "main" | "retail" | "transit" | "damaged";

export type EntityWarehouse = {
  id: string;
  code: string;
  name: string;
  company?: string;
  store?: string;
  warehouse_role?: WarehouseRole;
  is_primary?: boolean;
  is_active?: boolean;
};

export type EntityModules = {
  companyId: string;
  stores: Store[];
  warehouses: EntityWarehouse[];
  cashAccounts: CashAccount[];
  primaryWarehouse: EntityWarehouse | null;
  primaryCashAccount: CashAccount | null;
  primaryStore: Store | null;
};

export const WAREHOUSE_ROLE_LABELS: Record<WarehouseRole, string> = {
  main: "Gudang Entitas (penerimaan pembelian)",
  retail: "Gudang Penjualan (toko / POS / online)",
  transit: "Gudang Sementara",
  damaged: "Gudang Rusak",
};

/** Satu record operasional hanya milik satu entitas — company tidak boleh diganti. */
export function assertCompanyImmutable(
  existingCompany: string | undefined,
  nextCompany: string | undefined,
): void {
  if (!existingCompany) return;
  if (nextCompany && nextCompany !== existingCompany) {
    throw new Error("Entitas pemilik tidak boleh diubah setelah dibuat");
  }
}

export async function fetchEntityModules(companyId: string): Promise<EntityModules> {
  const [stores, warehouses, cashAccounts] = await Promise.all([
    pb.collection("biz_stores").getFullList<Store>({
      filter: `company = "${companyId}"`,
      sort: "-is_primary,name",
      requestKey: null,
    }),
    pb.collection(INV_COLLECTIONS.warehouses).getFullList<EntityWarehouse>({
      filter: `company = "${companyId}"`,
      sort: "-is_primary,name",
      requestKey: null,
    }),
    pb.collection("biz_cash_accounts").getFullList<CashAccount>({
      filter: `company = "${companyId}"`,
      sort: "-is_primary,name",
      requestKey: null,
    }),
  ]);

  const primaryWarehouse =
    warehouses.find((w) => w.is_primary && w.warehouse_role === "main") ??
    warehouses.find((w) => w.warehouse_role === "main") ??
    warehouses.find((w) => w.is_primary) ??
    null;

  const primaryCashAccount = cashAccounts.find((c) => c.is_primary) ?? cashAccounts[0] ?? null;
  const primaryStore = stores.find((s) => s.is_primary) ?? stores[0] ?? null;

  return {
    companyId,
    stores,
    warehouses,
    cashAccounts,
    primaryWarehouse,
    primaryCashAccount,
    primaryStore,
  };
}

/** Gudang utama — semua pembelian entitas masuk sini dulu. */
export async function getPrimaryReceivingWarehouse(companyId: string): Promise<EntityWarehouse | null> {
  const mods = await fetchEntityModules(companyId);
  return mods.primaryWarehouse;
}

/** Gudang sementara (transit) entitas — penampung sebelum QC / sortir retur. */
export async function getTransitWarehouse(
  companyId: string,
  pbInstance?: PocketBase,
): Promise<EntityWarehouse | null> {
  if (!companyId) return null;
  const db = pbInstance ?? pb;
  const rows = await db.collection(INV_COLLECTIONS.warehouses).getFullList<EntityWarehouse>({
    filter: `company = "${companyId.replace(/"/g, '\\"')}" && is_active = true && warehouse_role = "transit"`,
    sort: "name",
    requestKey: null,
  });
  return rows[0] ?? null;
}

/** Pastikan gudang sementara ada — buat otomatis jika belum ada (satu per entitas). */
export async function ensureTransitWarehouse(
  companyId: string,
  pbInstance: PocketBase,
): Promise<EntityWarehouse> {
  const existing = await getTransitWarehouse(companyId, pbInstance);
  if (existing) return existing;

  const { suggestWarehouseCode } = await import("@/lib/inventory/location-codes");
  const allWh = await pbInstance.collection(INV_COLLECTIONS.warehouses).getFullList<{ code: string }>({
    fields: "code",
    requestKey: null,
  });
  const code = suggestWarehouseCode(
    "Gudang Sementara",
    allWh.map((w) => w.code),
  );

  const row = await pbInstance.collection(INV_COLLECTIONS.warehouses).create({
    code,
    name: "Gudang Sementara",
    company: companyId,
    warehouse_role: "transit",
    is_active: true,
    is_primary: false,
    timezone: "Asia/Jakarta",
  });

  return row as unknown as EntityWarehouse;
}

/** Gudang rusak (damaged) entitas — karantina barang cacat. */
export async function getDamagedWarehouse(
  companyId: string,
  pbInstance?: PocketBase,
): Promise<EntityWarehouse | null> {
  if (!companyId) return null;
  const db = pbInstance ?? pb;
  const rows = await db.collection(INV_COLLECTIONS.warehouses).getFullList<EntityWarehouse>({
    filter: `company = "${companyId.replace(/"/g, '\\"')}" && is_active = true && warehouse_role = "damaged"`,
    sort: "name",
    requestKey: null,
  });
  return rows[0] ?? null;
}

/** Satu gudang entitas (role main) per entitas — penerimaan pembelian. */
export async function assertSingleEntityWarehouse(
  companyId: string,
  exceptWarehouseId?: string,
): Promise<void> {
  if (!companyId) return;
  const rows = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<{ id: string }>({
    filter: `company = "${companyId}" && is_active = true && warehouse_role = "main"`,
    fields: "id",
    requestKey: null,
  });
  const others = exceptWarehouseId ? rows.filter((r) => r.id !== exceptWarehouseId) : rows;
  if (others.length >= 1) {
    throw new Error(
      "Setiap entitas hanya boleh punya satu gudang entitas (penerimaan pembelian). Edit gudang entitas yang ada atau buat gudang penjualan untuk toko.",
    );
  }
}

/** @deprecated — gunakan assertSingleEntityWarehouse */
export const assertSingleWarehousePerEntity = assertSingleEntityWarehouse;

/** Satu gudang sementara (transit) per entitas. */
export async function assertSingleTransitWarehouse(
  companyId: string,
  exceptWarehouseId?: string,
): Promise<void> {
  if (!companyId) return;
  const rows = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<{ id: string }>({
    filter: `company = "${companyId}" && is_active = true && warehouse_role = "transit"`,
    fields: "id",
    requestKey: null,
  });
  const others = exceptWarehouseId ? rows.filter((r) => r.id !== exceptWarehouseId) : rows;
  if (others.length >= 1) {
    throw new Error(
      "Setiap entitas hanya boleh punya satu gudang sementara. Edit gudang yang ada atau nonaktifkan sebelum membuat baru.",
    );
  }
}

/** Satu gudang rusak (damaged) per entitas. */
export async function assertSingleDamagedWarehouse(
  companyId: string,
  exceptWarehouseId?: string,
): Promise<void> {
  if (!companyId) return;
  const rows = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<{ id: string }>({
    filter: `company = "${companyId}" && is_active = true && warehouse_role = "damaged"`,
    fields: "id",
    requestKey: null,
  });
  const others = exceptWarehouseId ? rows.filter((r) => r.id !== exceptWarehouseId) : rows;
  if (others.length >= 1) {
    throw new Error(
      "Setiap entitas hanya boleh punya satu gudang rusak. Edit gudang yang ada atau nonaktifkan sebelum membuat baru.",
    );
  }
}

export async function fetchSalesWarehousesForStore(storeId: string) {
  return pb.collection(INV_COLLECTIONS.warehouses).getFullList<EntityWarehouse>({
    filter: `store = "${storeId}" && is_active = true && warehouse_role = "retail"`,
    sort: "name",
    requestKey: null,
  });
}

/** Satu rekening kas/bank aktif per entitas (pembayaran pembelian). */
export async function assertSingleCashAccountPerEntity(
  companyId: string,
  exceptAccountId?: string,
): Promise<void> {
  if (!companyId) return;
  const rows = await pb.collection("biz_cash_accounts").getFullList<{ id: string }>({
    filter: `company = "${companyId}" && is_active = true`,
    fields: "id",
    requestKey: null,
  });
  const others = exceptAccountId ? rows.filter((r) => r.id !== exceptAccountId) : rows;
  if (others.length >= 1) {
    throw new Error(
      "Setiap entitas hanya boleh punya satu rekening bank (pembayaran pembelian). Edit rekening yang ada.",
    );
  }
}

/** Rekening utama — biaya & pembayaran hutang default. */
export async function getPrimaryCashAccount(companyId: string): Promise<CashAccount | null> {
  const mods = await fetchEntityModules(companyId);
  return mods.primaryCashAccount;
}

export async function clearPrimaryWarehouseFlag(companyId: string, exceptId?: string) {
  const rows = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<EntityWarehouse>({
    filter: `company = "${companyId}" && is_primary = true`,
    requestKey: null,
  });
  for (const r of rows) {
    if (r.id !== exceptId) {
      await pb.collection(INV_COLLECTIONS.warehouses).update(r.id, { is_primary: false });
    }
  }
}

export async function clearPrimaryCashFlag(companyId: string, exceptId?: string) {
  const rows = await pb.collection("biz_cash_accounts").getFullList<CashAccount>({
    filter: `company = "${companyId}" && is_primary = true`,
    requestKey: null,
  });
  for (const r of rows) {
    if (r.id !== exceptId) {
      await pb.collection("biz_cash_accounts").update(r.id, { is_primary: false });
    }
  }
}

/** Pilih ID rekening default untuk form pembayaran/biaya (utama → satu-satunya → kosong). */
export function pickPrimaryCashAccountId(accounts: CashAccount[]): string {
  const primary = accounts.find((a) => a.is_primary);
  if (primary) return primary.id;
  return accounts.length === 1 ? accounts[0].id : "";
}

export type ModuleListItem = {
  id: string;
  name: string;
  code?: string;
  company?: string;
  companyName?: string;
  /** Bisa dipilih untuk entitas saat ini. */
  selectable: boolean;
  warehouse_role?: WarehouseRole;
  default_warehouse?: string;
};

export type AvailableModules = {
  stores: ModuleListItem[];
  warehouses: ModuleListItem[];
  cashAccounts: ModuleListItem[];
};

function isActiveRecord(is_active?: boolean): boolean {
  return is_active !== false;
}

/** Modul tanpa entitas, atau sudah milik entitas yang sama (untuk edit). */
export function moduleIsSelectable(company: string | undefined, entityCompanyId?: string): boolean {
  if (!company) return true;
  return !!entityCompanyId && company === entityCompanyId;
}

function sortModuleList(items: ModuleListItem[]): ModuleListItem[] {
  return [...items].sort((a, b) => {
    if (a.selectable !== b.selectable) return a.selectable ? -1 : 1;
    return a.name.localeCompare(b.name, "id");
  });
}

function toModuleItem(
  row: { id: string; name: string; code?: string; company?: string },
  entityCompanyId: string | undefined,
  companyNames: Map<string, string>,
): ModuleListItem {
  const company = row.company;
  const selectable = moduleIsSelectable(company, entityCompanyId);
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    company,
    companyName: company ? companyNames.get(company) : undefined,
    selectable,
  };
}

/**
 * Semua modul aktif dari koleksi bisnis — tampil di dropdown.
 * Yang sudah terikat entitas lain: tetap tampil, selectable = false.
 */
export async function fetchAvailableModules(entityCompanyId?: string): Promise<AvailableModules> {
  const [storesRaw, warehousesRaw, cashRaw, companies] = await Promise.all([
    pb.collection("biz_stores").getFullList<Store>({
      sort: "name",
      fields: "id,name,company,default_warehouse,is_active",
      requestKey: null,
    }),
    pb.collection(INV_COLLECTIONS.warehouses).getFullList<EntityWarehouse>({
      sort: "name",
      fields: "id,name,code,company,warehouse_role,is_active",
      requestKey: null,
    }),
    pb.collection("biz_cash_accounts").getFullList<CashAccount>({
      sort: "name",
      fields: "id,name,code,company,is_active",
      requestKey: null,
    }),
    pb.collection("biz_company_profile").getFullList<{ id: string; company_name: string }>({
      filter: "is_active = true",
      fields: "id,company_name",
      requestKey: null,
    }),
  ]);

  const companyNames = new Map(companies.map((c) => [c.id, c.company_name]));

  const storesActive = storesRaw.filter((s) => isActiveRecord(s.is_active));
  const warehousesActive = warehousesRaw.filter((w) => isActiveRecord(w.is_active));
  const cashActive = cashRaw.filter((c) => isActiveRecord(c.is_active));

  return {
    stores: sortModuleList(
      storesActive.map((s) => ({
        ...toModuleItem(s, entityCompanyId, companyNames),
        default_warehouse: s.default_warehouse,
      })),
    ),
    warehouses: sortModuleList(
      warehousesActive.map((w) => ({
        ...toModuleItem(w, entityCompanyId, companyNames),
        warehouse_role: w.warehouse_role,
      })),
    ),
    cashAccounts: sortModuleList(cashActive.map((c) => toModuleItem(c, entityCompanyId, companyNames))),
  };
}

export function moduleOptionSub(item: ModuleListItem, entityCompanyId?: string): string {
  if (!item.company) return "Belum punya entitas";
  if (item.selectable && entityCompanyId && item.company === entityCompanyId) return "Milik entitas ini";
  return `Terikat: ${item.companyName ?? item.company}`;
}

export async function clearPrimaryStoreFlag(companyId: string, exceptId?: string) {
  const rows = await pb.collection("biz_stores").getFullList<Store>({
    filter: `company = "${companyId}" && is_primary = true`,
    requestKey: null,
  });
  for (const r of rows) {
    if (r.id !== exceptId) {
      await pb.collection("biz_stores").update(r.id, { is_primary: false });
    }
  }
}
