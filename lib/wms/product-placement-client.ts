import { pb } from "@/lib/pocketbase";
import type { InvLocation } from "@/lib/inventory/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { roomLabel } from "@/lib/inventory/product-slot-placement";
import { isPlacementsCollectionAvailable } from "@/lib/inventory/product-warehouse-placement";
import { SLOT_UI } from "@/lib/inventory/slot-terminology";

export type ProductPickHint = {
  productId: string;
  roomLabel: string | null;
  hasMasterPlacement: boolean;
  /** Produk punya default_location di gudang lain */
  wrongWarehouse?: boolean;
  otherWarehouseName?: string | null;
};

export type ProductPickHintsResult = {
  hints: Record<string, ProductPickHint>;
  roomCount: number;
  warehouseName?: string;
  error?: string;
};

type AssignmentsResponse = {
  ok?: boolean;
  byProductId?: Record<string, InvLocation>;
  rooms?: InvLocation[];
  warehouseName?: string;
  error?: string;
};

function escId(id: string): string {
  return id.replace(/"/g, '\\"');
}

async function fillHintsFromPb(
  warehouseId: string,
  productIds: string[],
  hints: Record<string, ProductPickHint>,
): Promise<void> {
  const missing = productIds.filter((id) => !hints[id]?.hasMasterPlacement);
  if (missing.length === 0) return;

  const whEsc = escId(warehouseId);
  const hasPlacements = await isPlacementsCollectionAvailable(pb);
  const stillMissing = new Set(missing);

  if (hasPlacements) {
    const prodFilter = missing.map((id) => `product = "${escId(id)}"`).join(" || ");
    const [localPlacements, otherPlacements] = await Promise.all([
      pb.collection(INV_COLLECTIONS.productPlacements).getFullList({
        filter: `warehouse = "${whEsc}" && (${prodFilter}) && is_active != false`,
        expand: "location",
        fields: "id,product,location",
        requestKey: null,
      }),
      pb.collection(INV_COLLECTIONS.productPlacements).getFullList({
        filter: `warehouse != "${whEsc}" && (${prodFilter}) && is_active != false`,
        expand: "location,warehouse",
        fields: "id,product,warehouse",
        requestKey: null,
      }),
    ]);

    for (const placement of localPlacements) {
      const pid = String(placement.product);
      if (!stillMissing.has(pid)) continue;
      const loc = placement.expand?.location as InvLocation | undefined;
      if (loc?.id && loc.warehouse === warehouseId && loc.is_active !== false) {
        hints[pid] = {
          productId: pid,
          roomLabel: roomLabel(loc),
          hasMasterPlacement: true,
        };
        stillMissing.delete(pid);
      }
    }

    for (const placement of otherPlacements) {
      const pid = String(placement.product);
      if (!stillMissing.has(pid) || hints[pid]?.hasMasterPlacement) continue;
      const loc = placement.expand?.location as InvLocation | undefined;
      const whName =
        (placement.expand as { warehouse?: { name?: string } })?.warehouse?.name ?? "gudang lain";
      hints[pid] = {
        productId: pid,
        roomLabel: loc ? roomLabel(loc) : null,
        hasMasterPlacement: false,
        wrongWarehouse: true,
        otherWarehouseName: whName,
      };
      stillMissing.delete(pid);
    }
  }

  if (stillMissing.size === 0) return;

  const idFilter = [...stillMissing].map((id) => `id = "${escId(id)}"`).join(" || ");
  const products = await pb.collection(INV_COLLECTIONS.products).getFullList({
    filter: idFilter,
    fields: "id,default_location",
    expand: "default_location,default_location.warehouse",
    requestKey: null,
  });

  for (const row of products) {
    const pid = String(row.id);
    if (!stillMissing.has(pid)) continue;
    const loc = row.expand?.default_location as
      | (InvLocation & { is_active?: boolean; expand?: { warehouse?: { id: string; name?: string } } })
      | undefined;
    if (!loc?.id || loc.is_active === false) continue;

    if (loc.warehouse !== warehouseId) {
      hints[pid] = {
        productId: pid,
        roomLabel: roomLabel(loc),
        hasMasterPlacement: false,
        wrongWarehouse: true,
        otherWarehouseName:
          loc.expand?.warehouse?.name ?? (loc.warehouse ? String(loc.warehouse) : "gudang lain"),
      };
      continue;
    }

    hints[pid] = {
      productId: pid,
      roomLabel: roomLabel(loc),
      hasMasterPlacement: true,
    };
  }
}

/** Muat penempatan slot per produk di satu gudang (picking / putaway). */
export async function fetchProductPickHints(
  warehouseId: string,
  productIds: string[],
): Promise<ProductPickHintsResult> {
  const hints: Record<string, ProductPickHint> = {};
  for (const id of productIds) {
    hints[id] = { productId: id, roomLabel: null, hasMasterPlacement: false };
  }
  if (!warehouseId || productIds.length === 0) {
    return { hints, roomCount: 0 };
  }

  const productsParam = productIds.join(",");
  const res = await fetch(
    `/api/inventory/locations/assignments?warehouse=${encodeURIComponent(warehouseId)}&products=${encodeURIComponent(productsParam)}`,
    { credentials: "include" },
  );
  const json = (await res.json()) as AssignmentsResponse;
  const roomCount = json.rooms?.length ?? 0;
  const warehouseName = json.warehouseName;

  if (res.ok && json.ok) {
    const byProductId = json.byProductId ?? {};
    for (const pid of productIds) {
      const room = byProductId[pid];
      if (room) {
        hints[pid] = {
          productId: pid,
          roomLabel: roomLabel(room),
          hasMasterPlacement: true,
        };
      }
    }
  }

  await fillHintsFromPb(warehouseId, productIds, hints);

  if (!res.ok || !json.ok) {
    return {
      hints,
      roomCount,
      warehouseName,
      error: json.error || `Gagal memuat slot (HTTP ${res.status})`,
    };
  }

  return { hints, roomCount, warehouseName };
}

export function formatPickHintLine(
  hint: ProductPickHint | undefined,
  opts?: { noRoomsInWarehouse?: boolean; warehouseName?: string },
): string {
  if (opts?.noRoomsInWarehouse) {
    return SLOT_UI.pickHintEmptyWarehouse;
  }
  if (hint?.wrongWarehouse) {
    const wh = hint.otherWarehouseName ?? "gudang lain";
    const loc = hint.roomLabel ? ` (${hint.roomLabel})` : "";
    return `Produk di gudang lain: ${wh}${loc} — atur slot di Daftar Produk untuk gudang order ini`;
  }
  if (!hint?.hasMasterPlacement) {
    return SLOT_UI.pickHintMissing;
  }
  const whPrefix = opts?.warehouseName?.trim() ? `${opts.warehouseName.trim()} · ` : "";
  return hint.roomLabel
    ? `${SLOT_UI.pickHintTake}: ${whPrefix}${hint.roomLabel}`
    : "Kode slot belum lengkap";
}

export function formatPutawayHintLine(hint: ProductPickHint | undefined, warehouseName: string): string {
  if (hint?.wrongWarehouse) {
    const wh = hint.otherWarehouseName ?? "gudang lain";
    return `Produk sudah di ${wh} — pindahkan penempatan ke ${warehouseName}`;
  }
  if (!hint?.hasMasterPlacement) {
    return `Produk baru — tentukan slot di gudang ${warehouseName}`;
  }
  return hint.roomLabel ? `Taruh di: ${warehouseName} · ${hint.roomLabel}` : `Susun di gudang ${warehouseName}`;
}
