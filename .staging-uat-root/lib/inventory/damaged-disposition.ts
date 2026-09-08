import type PocketBase from "pocketbase";
import { isDamagedWarehouse, isSalesWarehouse } from "@/lib/bisnis/warehouse-categories";
import { postOutStockMovementServer } from "@/lib/inventory/auto-stock-server";
import { createDamagedWriteOffExpenseDraft } from "@/lib/inventory/damaged-accounting";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { postTransferStockMovementServer } from "@/lib/inventory/transfer-stock-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export type DamagedStockRow = {
  balanceId: string;
  productId: string;
  sku: string;
  name: string;
  barcode?: string;
  qtyOnHand: number;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  companyId: string;
};

export type DamagedWarehouseOption = {
  id: string;
  code: string;
  name: string;
  companyId: string;
};

export type RetailWarehouseOption = {
  id: string;
  code: string;
  name: string;
  companyId: string;
  storeName?: string;
};

export function damagedStockRowKey(warehouseId: string, productId: string): string {
  return `${warehouseId}:${productId}`;
}

type BalanceRecord = {
  id: string;
  product: string;
  warehouse: string;
  qty_on_hand?: number;
  expand?: {
    product?: { id: string; sku?: string; name?: string; barcode?: string };
    warehouse?: { id: string; code?: string; name?: string; company?: string; warehouse_role?: string };
  };
};

function escId(id: string): string {
  return id.replace(/"/g, '\\"');
}

export async function listDamagedWarehouses(pb: PocketBase): Promise<DamagedWarehouseOption[]> {
  const rows = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<{
    id: string;
    code: string;
    name: string;
    company?: string;
    warehouse_role?: string;
    is_active?: boolean;
  }>({
    filter: 'is_active = true && warehouse_role = "damaged"',
    sort: "code",
    fields: "id,code,name,company,warehouse_role,is_active",
    requestKey: null,
  });

  return rows
    .filter((w) => w.company)
    .map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      companyId: w.company!,
    }));
}

export async function listRetailWarehousesByCompany(
  pb: PocketBase,
): Promise<Record<string, RetailWarehouseOption[]>> {
  const rows = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<{
    id: string;
    code: string;
    name: string;
    company?: string;
    store?: string;
    warehouse_role?: string;
    is_active?: boolean;
    expand?: { store?: { name?: string } };
  }>({
    filter: 'is_active = true && warehouse_role = "retail"',
    sort: "code",
    fields: "id,code,name,company,store,warehouse_role",
    expand: "store",
    requestKey: null,
  });

  const byCompany: Record<string, RetailWarehouseOption[]> = {};
  for (const w of rows.filter(isSalesWarehouse)) {
    if (!w.company) continue;
    const opt: RetailWarehouseOption = {
      id: w.id,
      code: w.code,
      name: w.name,
      companyId: w.company,
      storeName: w.expand?.store?.name,
    };
    if (!byCompany[w.company]) byCompany[w.company] = [];
    byCompany[w.company].push(opt);
  }
  return byCompany;
}

export async function listDamagedWarehouseStock(
  pb: PocketBase,
  opts?: { companyId?: string; warehouseId?: string },
): Promise<DamagedStockRow[]> {
  let warehouses = await listDamagedWarehouses(pb);
  if (opts?.companyId) {
    warehouses = warehouses.filter((w) => w.companyId === opts.companyId);
  }
  if (opts?.warehouseId) {
    warehouses = warehouses.filter((w) => w.id === opts.warehouseId);
  }
  if (warehouses.length === 0) return [];

  const whIds = warehouses.map((w) => w.id);
  const whFilter = whIds.map((id) => `warehouse = "${escId(id)}"`).join(" || ");

  const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList<BalanceRecord>({
    filter: `(${whFilter}) && qty_on_hand > 0`,
    expand: "product,warehouse",
    sort: "product",
    requestKey: null,
  });

  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const rows: DamagedStockRow[] = [];

  for (const bal of balances) {
    const qty = Number(bal.qty_on_hand) || 0;
    if (qty <= 0) continue;

    const whId = String(bal.warehouse ?? bal.expand?.warehouse?.id ?? "");
    const whMeta = whById.get(whId);
    const whExpand = bal.expand?.warehouse;
    if (!whMeta && !whExpand) continue;

    const product = bal.expand?.product;
    rows.push({
      balanceId: bal.id,
      productId: String(bal.product ?? product?.id ?? ""),
      sku: product?.sku ?? "—",
      name: product?.name ?? "—",
      barcode: product?.barcode,
      qtyOnHand: qty,
      warehouseId: whId,
      warehouseCode: whMeta?.code ?? whExpand?.code ?? "",
      warehouseName: whMeta?.name ?? whExpand?.name ?? "",
      companyId: whMeta?.companyId ?? whExpand?.company ?? "",
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, "id"));
}

export type DispositionLine = { product: string; qty: number };

async function assertDamagedWarehouseAndCompany(
  pb: PocketBase,
  damagedWarehouseId: string,
  companyId: string,
): Promise<void> {
  const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne<{
    id: string;
    company?: string;
    warehouse_role?: string;
    is_active?: boolean;
  }>(damagedWarehouseId, { fields: "id,company,warehouse_role,is_active" });

  if (!isDamagedWarehouse(wh)) {
    throw new Error("Gudang asal bukan gudang rusak.");
  }
  if (wh.is_active === false) {
    throw new Error("Gudang rusak tidak aktif.");
  }
  if (companyId && wh.company && wh.company !== companyId) {
    throw new Error("Gudang rusak tidak sesuai entitas yang dipilih.");
  }
}

async function assertStockAvailable(
  pb: PocketBase,
  damagedWarehouseId: string,
  lines: DispositionLine[],
): Promise<void> {
  const productIds = [...new Set(lines.map((l) => l.product).filter(Boolean))];
  if (productIds.length === 0) {
    throw new Error("Tidak ada produk untuk diproses.");
  }

  const filter = productIds.map((id) => `product = "${escId(id)}"`).join(" || ");
  const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList<{
    product: string;
    qty_on_hand?: number;
  }>({
    filter: `warehouse = "${escId(damagedWarehouseId)}" && (${filter})`,
    fields: "product,qty_on_hand",
    requestKey: null,
  });

  const onHand = new Map<string, number>();
  for (const b of balances) {
    onHand.set(String(b.product), Number(b.qty_on_hand) || 0);
  }

  for (const line of lines) {
    const need = Number(line.qty) || 0;
    if (!line.product || need <= 0) continue;
    const have = onHand.get(line.product) ?? 0;
    if (need > have) {
      throw new Error(`Stok gudang rusak tidak cukup (butuh ${need}, ada ${have}).`);
    }
  }
}

function aggregateLines(lines: DispositionLine[]): DispositionLine[] {
  const map = new Map<string, number>();
  for (const l of lines) {
    const qty = Number(l.qty) || 0;
    if (!l.product || qty <= 0) continue;
    map.set(l.product, (map.get(l.product) ?? 0) + qty);
  }
  return [...map.entries()].map(([product, qty]) => ({ product, qty }));
}

function dispositionRefNo(action: "repair" | "write_off" | "reassign"): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getTime()).slice(-6)}`;
  if (action === "repair") return `REP-${stamp}`;
  if (action === "reassign") return `RAS-${stamp}`;
  return `SCRAP-${stamp}`;
}

async function getWarehouseCompany(
  pb: PocketBase,
  warehouseId: string,
): Promise<{ id: string; company?: string; warehouse_role?: string }> {
  return pb.collection(INV_COLLECTIONS.warehouses).getOne(warehouseId, {
    fields: "id,company,warehouse_role,is_active",
  });
}

async function getEntityWarehouseForCompany(pb: PocketBase, companyId: string) {
  const rows = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<{
    id: string;
    is_primary?: boolean;
  }>({
    filter: `company = "${escId(companyId)}" && is_active = true && warehouse_role = "main"`,
    sort: "-is_primary,name",
    fields: "id,is_primary",
    requestKey: null,
  });
  return rows.find((w) => w.is_primary) ?? rows[0] ?? null;
}

/** Perbaikan berhasil — transfer gudang rusak → gudang entitas atau retail. */
export async function repairDamagedStock(input: {
  damagedWarehouseId: string;
  companyId: string;
  lines: DispositionLine[];
  userId: string;
  note?: string;
  repairTarget?: "entity" | "retail";
  targetWarehouseId?: string;
}) {
  const pb = await getInventoryAdminPb();
  const lines = aggregateLines(input.lines);
  if (lines.length === 0) throw new Error("Qty perbaikan wajib diisi.");

  await assertDamagedWarehouseAndCompany(pb, input.damagedWarehouseId, input.companyId);
  await assertStockAvailable(pb, input.damagedWarehouseId, lines);

  const targetKind = input.repairTarget ?? "entity";
  let toWarehouseId: string;

  if (targetKind === "retail") {
    if (!input.targetWarehouseId) {
      throw new Error("Pilih gudang penjualan retail tujuan.");
    }
    const target = await getWarehouseCompany(pb, input.targetWarehouseId);
    if (!isSalesWarehouse(target)) {
      throw new Error("Tujuan perbaiki harus gudang penjualan retail.");
    }
    if (target.company && target.company !== input.companyId) {
      throw new Error("Gudang retail tujuan harus satu entitas dengan gudang rusak.");
    }
    toWarehouseId = input.targetWarehouseId;
  } else {
    const entityWh = await getEntityWarehouseForCompany(pb, input.companyId);
    if (!entityWh) {
      throw new Error("Gudang entitas belum dibuat untuk PT/CV ini.");
    }
    toWarehouseId = entityWh.id;
  }

  const refNo = dispositionRefNo("repair");
  const destLabel = targetKind === "retail" ? "gudang penjualan" : "gudang entitas";
  const noteSuffix = input.note?.trim()
    ? `Servis berhasil → ${destLabel} | ${input.note.trim()}`
    : `Servis berhasil → ${destLabel}`;

  return postTransferStockMovementServer({
    from_warehouse: input.damagedWarehouseId,
    to_warehouse: toWarehouseId,
    reference_type: targetKind === "retail" ? "DAMAGED_REPAIR_RETAIL" : "DAMAGED_REPAIR",
    reference_id: input.damagedWarehouseId,
    reference_no: refNo,
    lines,
    userId: input.userId,
    noteSuffix,
  });
}

/** Koreksi salah entitas — pindah antar gudang rusak (supervisor). */
export async function reassignDamagedStock(input: {
  fromDamagedWarehouseId: string;
  toDamagedWarehouseId: string;
  lines: DispositionLine[];
  userId: string;
  note: string;
}) {
  const pb = await getInventoryAdminPb();
  const lines = aggregateLines(input.lines);
  if (lines.length === 0) throw new Error("Qty koreksi wajib diisi.");
  if (!input.note?.trim() || input.note.trim().length < 5) {
    throw new Error("Alasan koreksi entitas wajib diisi (min. 5 karakter).");
  }
  if (input.fromDamagedWarehouseId === input.toDamagedWarehouseId) {
    throw new Error("Gudang asal dan tujuan tidak boleh sama.");
  }

  const [fromWh, toWh] = await Promise.all([
    getWarehouseCompany(pb, input.fromDamagedWarehouseId),
    getWarehouseCompany(pb, input.toDamagedWarehouseId),
  ]);

  if (!isDamagedWarehouse(fromWh) || !isDamagedWarehouse(toWh)) {
    throw new Error("Koreksi hanya antar gudang rusak.");
  }
  if (!fromWh.company || !toWh.company) {
    throw new Error("Kedua gudang rusak wajib terikat entitas.");
  }

  await assertStockAvailable(pb, input.fromDamagedWarehouseId, lines);

  const refNo = dispositionRefNo("reassign");

  return postTransferStockMovementServer({
    from_warehouse: input.fromDamagedWarehouseId,
    to_warehouse: input.toDamagedWarehouseId,
    reference_type: "DAMAGED_REASSIGN",
    reference_id: input.fromDamagedWarehouseId,
    reference_no: refNo,
    lines,
    userId: input.userId,
    noteSuffix: `Koreksi entitas gudang rusak | ${input.note.trim()}`,
  });
}

/** Tidak bisa diperbaiki — keluar total dari gudang rusak (write-off). */
export async function writeOffDamagedStock(input: {
  damagedWarehouseId: string;
  companyId: string;
  lines: DispositionLine[];
  userId: string;
  note?: string;
}) {
  const pb = await getInventoryAdminPb();
  const lines = aggregateLines(input.lines);
  if (lines.length === 0) throw new Error("Qty buang wajib diisi.");
  if (!input.note?.trim()) {
    throw new Error("Catatan teknisi wajib untuk pembuangan (alasan tidak bisa diperbaiki).");
  }

  await assertDamagedWarehouseAndCompany(pb, input.damagedWarehouseId, input.companyId);
  await assertStockAvailable(pb, input.damagedWarehouseId, lines);

  const refNo = dispositionRefNo("write_off");

  const movement = await postOutStockMovementServer({
    warehouse: input.damagedWarehouseId,
    reference_type: "DAMAGED_WRITE_OFF",
    reference_id: input.damagedWarehouseId,
    reference_no: refNo,
    lines,
    userId: input.userId,
    noteSuffix: `Buang dari gudang rusak | ${input.note.trim()}`,
  });

  const expense = await createDamagedWriteOffExpenseDraft({
    pb,
    companyId: input.companyId,
    refNo,
    lines,
    userId: input.userId,
    note: input.note.trim(),
  });

  return { movement, expense };
}
