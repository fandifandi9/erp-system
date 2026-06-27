import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Courier, type CourierService } from "@/lib/bisnis/types";

const SERVER_CACHE_TTL_MS = 5 * 60 * 1000;
let serverCatalogCache: {
  at: number;
  activeOnly: boolean;
  couriers: Courier[];
  servicesByCourier: Record<string, CourierService[]>;
} | null = null;

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string; status?: number };
  const raw = e instanceof Error ? e.message : err.message ?? fallback;
  if (/wasn't found|404|collection/i.test(raw)) {
    return "Collection ekspedisi belum dibuat di PocketBase. Ikuti POCKETBASE_POS_SETUP.md §11.";
  }
  return raw;
}

/** Satu request: daftar ekspedisi + semua layanan (lebih cepat dari fetch terpisah). */
export async function GET(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active") !== "0";

    const now = Date.now();
    if (
      serverCatalogCache &&
      serverCatalogCache.activeOnly === activeOnly &&
      now - serverCatalogCache.at < SERVER_CACHE_TTL_MS
    ) {
      return NextResponse.json({
        couriers: serverCatalogCache.couriers,
        servicesByCourier: serverCatalogCache.servicesByCourier,
      });
    }

    const adminPb = await getInventoryAdminPb();
    const courierFilter = activeOnly ? "is_active = true" : undefined;
    const serviceFilter = activeOnly ? "is_active = true" : undefined;

    const [couriers, allServices] = await Promise.all([
      adminPb.collection(BISNIS_COLLECTIONS.couriers).getFullList<Courier>({
        sort: "name",
        filter: courierFilter,
        requestKey: null,
      }),
      adminPb.collection(BISNIS_COLLECTIONS.courierServices).getFullList<CourierService>({
        sort: "sort_order,name",
        filter: serviceFilter,
        requestKey: null,
      }),
    ]);

    const servicesByCourier: Record<string, CourierService[]> = {};
    for (const row of allServices) {
      const cid = row.courier;
      if (!cid) continue;
      (servicesByCourier[cid] ??= []).push(row);
    }

    serverCatalogCache = { at: now, activeOnly, couriers, servicesByCourier };

    return NextResponse.json({ couriers, servicesByCourier });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal memuat katalog ekspedisi") }, { status });
  }
}
