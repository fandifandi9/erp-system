import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getWarehouseDirectoryServer } from "@/lib/inventory/stock-list-server";

export async function GET(req: Request) {
  try {
    await requireInventoryAccess(req);
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    if (fresh) {
      const { invalidateWarehouseDirectoryCache } = await import("@/lib/inventory/stock-list-server");
      invalidateWarehouseDirectoryCache();
    }
    const directory = await getWarehouseDirectoryServer();
    return NextResponse.json({ ok: true, ...directory });
  } catch (err) {
    return jsonError(err, "Gagal memuat daftar gudang.");
  }
}
