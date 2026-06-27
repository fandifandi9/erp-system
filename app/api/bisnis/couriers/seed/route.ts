import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { seedDefaultCouriers } from "@/lib/bisnis/seed-couriers-server";

export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const result = await seedDefaultCouriers(adminPb);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string; response?: { message?: string } };
    const status = typeof err.status === "number" ? err.status : 500;
    const raw = e instanceof Error ? e.message : err.message ?? "Gagal mengisi data contoh";
    const error =
      /wasn't found|404|collection/i.test(raw)
        ? "Collection biz_couriers / biz_courier_services belum dibuat di PocketBase. Ikuti POCKETBASE_POS_SETUP.md §11."
        : raw;
    return NextResponse.json({ error }, { status: status === 404 ? 500 : status });
  }
}
