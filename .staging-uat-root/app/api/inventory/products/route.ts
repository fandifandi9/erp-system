import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

async function getPb(req: Request, auth: Awaited<ReturnType<typeof requireInventoryAccess>>) {
  try {
    return await getInventoryAdminPb();
  } catch {
    return getUserPbFromRequest(req, auth);
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const perPage = Math.min(Number(url.searchParams.get("perPage") ?? 200), 500);

    const pb = await getPb(req, auth);
    let filter = "is_active = true";
    if (q) {
      const esc = q.replace(/"/g, '\\"');
      filter += ` && (sku ~ "${esc}" || name ~ "${esc}" || barcode ~ "${esc}")`;
    }

    const res = await pb.collection(INV_COLLECTIONS.products).getList(1, perPage, {
      sort: "name",
      filter,
      fields: "id,sku,name,barcode,is_active",
    });

    return NextResponse.json({ ok: true, items: res.items });
  } catch (err) {
    return jsonError(err, "Gagal memuat produk.");
  }
}
