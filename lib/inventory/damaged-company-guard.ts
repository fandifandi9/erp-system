import type PocketBase from "pocketbase";
import { isDamagedWarehouse } from "@/lib/bisnis/warehouse-categories";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type WhRow = {
  id: string;
  company?: string;
  warehouse_role?: string;
  is_active?: boolean;
};

export type DamagedTransferContext = {
  fromCompanyId?: string;
  toCompanyId?: string;
  fromDamaged: boolean;
  toDamaged: boolean;
};

async function loadWarehouse(pb: PocketBase, id: string): Promise<WhRow> {
  return pb.collection(INV_COLLECTIONS.warehouses).getOne<WhRow>(id, {
    fields: "id,company,warehouse_role,is_active",
  });
}

/**
 * Validasi entitas saat stok masuk/keluar gudang rusak.
 * Koreksi antar GR (DAMAGED_REASSIGN) boleh beda entitas — sengaja.
 */
export async function assertDamagedTransferRules(
  pb: PocketBase,
  input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    referenceType?: string;
  },
): Promise<DamagedTransferContext> {
  const ref = input.referenceType?.trim() ?? "";
  const [fromWh, toWh] = await Promise.all([
    loadWarehouse(pb, input.fromWarehouseId),
    loadWarehouse(pb, input.toWarehouseId),
  ]);

  const fromDamaged = isDamagedWarehouse(fromWh);
  const toDamaged = isDamagedWarehouse(toWh);
  const ctx: DamagedTransferContext = {
    fromCompanyId: fromWh.company,
    toCompanyId: toWh.company,
    fromDamaged,
    toDamaged,
  };

  if (fromDamaged && toDamaged && ref === "DAMAGED_REASSIGN") {
    return ctx;
  }

  if (toDamaged && !fromDamaged) {
    if (!fromWh.company || !toWh.company) {
      throw new Error("Gudang asal dan gudang rusak wajib terikat entitas (PT/CV).");
    }
    if (fromWh.company !== toWh.company) {
      throw new Error(
        "Transfer ke gudang rusak harus dari gudang entitas yang sama — pilih gudang rusak milik PT/CV yang benar.",
      );
    }
  }

  if (fromDamaged && !toDamaged) {
    if (!fromWh.company || !toWh.company) {
      throw new Error("Gudang rusak dan tujuan perbaikan wajib terikat entitas.");
    }
    if (fromWh.company !== toWh.company) {
      throw new Error(
        "Perbaikan dari gudang rusak harus ke gudang entitas/retail milik entitas yang sama.",
      );
    }
  }

  if (fromDamaged && toDamaged && ref !== "DAMAGED_REASSIGN") {
    throw new Error(
      "Pindah antar gudang rusak beda entitas hanya via aksi Koreksi entitas di Servis Gudang Rusak.",
    );
  }

  return ctx;
}

/** Pastikan gudang rusak yang dipilih milik entitas transaksi. */
export async function assertDamagedWarehouseForCompany(
  pb: PocketBase,
  damagedWarehouseId: string,
  companyId: string,
): Promise<void> {
  if (!companyId) return;
  const wh = await loadWarehouse(pb, damagedWarehouseId);
  if (!isDamagedWarehouse(wh)) {
    throw new Error("Gudang tujuan bukan gudang rusak.");
  }
  if (wh.company && wh.company !== companyId) {
    throw new Error("Gudang rusak tidak sesuai entitas transaksi.");
  }
}
