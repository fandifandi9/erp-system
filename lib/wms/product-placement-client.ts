import type { InvLocation } from "@/lib/inventory/types";
import { roomLabel } from "@/lib/inventory/product-slot-placement";

export type ProductPickHint = {
  productId: string;
  roomLabel: string | null;
  hasMasterPlacement: boolean;
};

export type ProductPickHintsResult = {
  hints: Record<string, ProductPickHint>;
  roomCount: number;
  error?: string;
};

type AssignmentsResponse = {
  ok?: boolean;
  byProductId?: Record<string, InvLocation>;
  rooms?: InvLocation[];
  error?: string;
};

/** Muat penempatan ruangan per produk di satu gudang (untuk picking / petunjuk keluar-masuk). */
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

  const res = await fetch(
    `/api/inventory/locations/assignments?warehouse=${encodeURIComponent(warehouseId)}`,
    { credentials: "include" },
  );
  const json = (await res.json()) as AssignmentsResponse;
  const roomCount = json.rooms?.length ?? 0;

  if (!res.ok || !json.ok) {
    return {
      hints,
      roomCount,
      error: json.error || `Gagal memuat ruangan (HTTP ${res.status})`,
    };
  }

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
  return { hints, roomCount };
}

export function formatPickHintLine(
  hint: ProductPickHint | undefined,
  opts?: { noRoomsInWarehouse?: boolean },
): string {
  if (opts?.noRoomsInWarehouse) {
    return "Belum ada ruangan di gudang ini — buat di Lokasi Ruangan / Daftar Gudang";
  }
  if (!hint?.hasMasterPlacement) {
    return "Produk belum ditetapkan ke ruangan — atur di Gudang → Daftar Produk";
  }
  return hint.roomLabel ? `Ambil dari: ${hint.roomLabel}` : "Lokasi ruangan belum lengkap";
}

export function formatPutawayHintLine(hint: ProductPickHint | undefined, warehouseName: string): string {
  if (!hint?.hasMasterPlacement) {
    return `Produk baru — tentukan ruangan di gudang ${warehouseName}`;
  }
  return hint.roomLabel ? `Taruh di: ${hint.roomLabel}` : `Susun di gudang ${warehouseName}`;
}
