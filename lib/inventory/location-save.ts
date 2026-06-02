import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { encodePlacementInName } from "@/lib/inventory/location-fields";
import { encodeProductInLocationName } from "@/lib/inventory/slot-product";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export type LocationSaveInput = {
  id?: string;
  warehouse: string;
  code: string;
  name?: string;
  zone_type: string;
  aisle?: string;
  level?: string;
  bin?: string;
  assigned_product?: string;
  /** Jangan ubah nama (untuk suffix layout rak). */
  preserveName?: boolean;
};

function isUnknownFieldError(err: unknown): boolean {
  if (!(err instanceof ClientResponseError)) return false;
  if (err.status !== 400) return false;
  const msg = `${err.message} ${JSON.stringify(err.data ?? {})}`.toLowerCase();
  return (
    msg.includes("unknown field") ||
    msg.includes("invalid field") ||
    msg.includes("aisle") ||
    msg.includes("level") ||
    msg.includes("bin") ||
    msg.includes("assigned_product") ||
    msg.includes("produk")
  );
}

function buildPayloads(data: LocationSaveInput) {
  const code = data.code.trim().toUpperCase();
  const displayName = (data.name?.trim() || code).trim();

  if (data.preserveName && displayName) {
    const preserved: Record<string, unknown> = {
      name: displayName,
      zone_type: data.zone_type,
      is_active: true,
    };
    const payloads = [preserved];
    return { code, updatePayloads: payloads, createPayloads: payloads };
  }

  const placement = {
    aisle: data.aisle?.trim() ?? "",
    level: data.level?.trim() ?? "",
    bin: data.bin?.trim() ?? "",
  };
  const hasPlacement = !!(placement.aisle || placement.level || placement.bin);

  const base: Record<string, unknown> = {
    name: displayName,
    zone_type: data.zone_type,
    is_active: true,
  };

  const withEncodedName: Record<string, unknown> = {
    name: encodePlacementInName(displayName, placement),
    zone_type: data.zone_type,
    is_active: true,
  };

  const withFields: Record<string, unknown> = {
    ...withEncodedName,
  };
  if (placement.aisle) withFields.aisle = placement.aisle;
  if (placement.level) withFields.level = placement.level;
  if (placement.bin) withFields.bin = placement.bin;

  const productId = data.assigned_product?.trim() ?? "";
  const nameWithProduct = productId
    ? encodeProductInLocationName(displayName, productId)
    : displayName;

  const withProduct: Record<string, unknown> = {
    name: nameWithProduct,
    zone_type: data.zone_type,
    is_active: true,
  };
  if (productId) withProduct.assigned_product = productId;
  if (placement.aisle) withProduct.aisle = placement.aisle;
  if (placement.level) withProduct.level = placement.level;
  if (placement.bin) withProduct.bin = placement.bin;

  const updatePayloads = productId
    ? [withProduct, withEncodedName, withFields, base]
    : hasPlacement
      ? [withEncodedName, withFields, base]
      : [base];

  return {
    code,
    updatePayloads,
    createPayloads: productId
      ? [withProduct, withEncodedName, withFields, base]
      : hasPlacement
        ? [withEncodedName, withFields, base]
        : [base],
  };
}

async function tryUpdate(pb: PocketBase, id: string, payloads: Record<string, unknown>[]) {
  let last: unknown;
  for (const payload of payloads) {
    try {
      return await pb.collection(INV_COLLECTIONS.locations).update(id, payload);
    } catch (err) {
      last = err;
      if (!isUnknownFieldError(err)) throw err;
    }
  }
  throw last;
}

async function tryCreate(
  pb: PocketBase,
  data: LocationSaveInput,
  code: string,
  payloads: Record<string, unknown>[],
) {
  let last: unknown;
  for (const payload of payloads) {
    try {
      return await pb.collection(INV_COLLECTIONS.locations).create({
        warehouse: data.warehouse,
        code,
        ...payload,
      });
    } catch (err) {
      last = err;
      if (!isUnknownFieldError(err)) throw err;
    }
  }
  throw last;
}

async function assertCodeAvailable(
  pb: PocketBase,
  warehouseId: string,
  code: string,
  excludeId?: string,
) {
  try {
    const existing = await pb
      .collection(INV_COLLECTIONS.locations)
      .getFirstListItem(`warehouse = "${warehouseId}" && code = "${code.replace(/"/g, '\\"')}"`);
    if (excludeId && existing.id === excludeId) return;
    throw new Error(`Kode lokasi "${code}" sudah dipakai di gudang ini.`);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return;
    if (err instanceof Error && err.message.includes("sudah dipakai")) throw err;
    throw err;
  }
}

export async function persistLocation(pb: PocketBase, data: LocationSaveInput) {
  const { code, updatePayloads, createPayloads } = buildPayloads(data);

  if (data.id) {
    const existing = (await pb.collection(INV_COLLECTIONS.locations).getOne(data.id)) as {
      id: string;
      code?: string;
    };
    const prevCode = (existing.code ?? "").trim().toUpperCase();

    if (code !== prevCode) {
      await assertCodeAvailable(pb, data.warehouse, code, data.id);
    }

    const record = await tryUpdate(pb, data.id, updatePayloads);

    if (code !== prevCode) {
      await pb.collection(INV_COLLECTIONS.locations).update(data.id, { code });
      return { ...record, code };
    }
    return record;
  }

  await assertCodeAvailable(pb, data.warehouse, code);
  return tryCreate(pb, data, code, createPayloads);
}

export async function persistLocationDeactivate(pb: PocketBase, id: string) {
  return pb.collection(INV_COLLECTIONS.locations).update(id, { is_active: false });
}

export async function persistLocationDelete(pb: PocketBase, id: string) {
  return pb.collection(INV_COLLECTIONS.locations).delete(id);
}
