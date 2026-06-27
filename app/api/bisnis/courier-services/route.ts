import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type CourierService } from "@/lib/bisnis/types";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string; status?: number };
  const raw = e instanceof Error ? e.message : err.message ?? fallback;
  if (/wasn't found|404|collection/i.test(raw)) {
    return "Collection biz_courier_services belum dibuat di PocketBase. Ikuti POCKETBASE_POS_SETUP.md §11.";
  }
  return raw;
}

export async function GET(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const url = new URL(req.url);
    const courierId = url.searchParams.get("courier")?.trim();
    const activeOnly = url.searchParams.get("active") !== "0";
    const filters: string[] = [];
    if (courierId) filters.push(`courier = "${courierId}"`);
    if (activeOnly) filters.push("is_active = true");

    const adminPb = await getInventoryAdminPb();
    const items = await adminPb
      .collection(BISNIS_COLLECTIONS.courierServices)
      .getFullList<CourierService>({
        sort: "sort_order,name",
        filter: filters.length ? filters.join(" && ") : undefined,
        requestKey: null,
      });
    return NextResponse.json(items);
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal memuat layanan") }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const body = (await req.json()) as Partial<CourierService>;
    if (!body.courier?.trim()) {
      return NextResponse.json({ error: "Ekspedisi wajib dipilih" }, { status: 400 });
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Nama layanan wajib diisi" }, { status: 400 });
    }
    const adminPb = await getInventoryAdminPb();
    const row = await adminPb.collection(BISNIS_COLLECTIONS.courierServices).create<CourierService>({
      courier: body.courier,
      name: body.name.trim(),
      code: body.code?.trim() || undefined,
      sort_order: Number(body.sort_order) || 0,
      is_active: body.is_active ?? true,
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal menyimpan layanan") }, { status });
  }
}
