import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { fetchBundlesEstimatedGlobalQty } from "@/lib/catalog/bundle-expand";

export async function POST(req: Request) {
  try {
    await requireCatalogAccess(req);
    const body = (await req.json()) as { bundleIds?: string[] };
    const qty = await fetchBundlesEstimatedGlobalQty(body.bundleIds ?? []);
    return NextResponse.json({ ok: true, qty });
  } catch (err) {
    return jsonError(err, "Gagal menghitung stok estimasi bundle.");
  }
}
