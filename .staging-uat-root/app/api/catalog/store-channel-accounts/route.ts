import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { getCatalogPb } from "@/lib/catalog/api-server";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

export async function GET(req: Request) {
  try {
    await requireCatalogAccess(req);
    const url = new URL(req.url);
    const storeId = url.searchParams.get("store")?.trim() ?? "";
    const pb = await getCatalogPb();
    let filter = "is_active = true";
    if (storeId) {
      filter += ` && store = "${storeId.replace(/"/g, '\\"')}"`;
    }
    const items = await pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).getFullList({
      filter,
      sort: "account_name",
      expand: "store,channel,seller_tier",
      requestKey: null,
    });
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return jsonError(err, "Gagal memuat akun marketplace.");
  }
}
