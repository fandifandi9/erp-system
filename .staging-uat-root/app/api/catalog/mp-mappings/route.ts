import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { canEditCatalogPrices, resolveCatalogViewRole } from "@/lib/catalog/catalog-access";
import { getCatalogPb } from "@/lib/catalog/api-server";
import { createMpMapping, listMpMappings } from "@/lib/catalog/mp-mapping-server";

export async function GET(req: Request) {
  try {
    await requireCatalogAccess(req);
    const url = new URL(req.url);
    const storeId = url.searchParams.get("store")?.trim() || undefined;
    const accountId = url.searchParams.get("account")?.trim() || undefined;
    const q = url.searchParams.get("q")?.trim() || undefined;
    const pb = await getCatalogPb();
    const items = await listMpMappings(pb, { storeId, accountId, q });
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return jsonError(err, "Gagal memuat mapping MP.");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireCatalogAccess(req);
    const role = resolveCatalogViewRole(auth.user);
    if (!canEditCatalogPrices(auth.user) && role !== "owner") {
      return NextResponse.json({ ok: false, error: "Tidak boleh mengubah mapping." }, { status: 403 });
    }
    const body = (await req.json()) as {
      store_channel_account?: string;
      mp_sku?: string;
      mp_product_name?: string;
      product?: string;
      is_active?: boolean;
    };
    const pb = await getCatalogPb();
    const item = await createMpMapping(pb, {
      store_channel_account: body.store_channel_account ?? "",
      mp_sku: body.mp_sku ?? "",
      mp_product_name: body.mp_product_name,
      product: body.product ?? "",
      is_active: body.is_active,
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return jsonError(err, "Gagal membuat mapping.");
  }
}

/** Daftar akun marketplace untuk dropdown UI. */
export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}
