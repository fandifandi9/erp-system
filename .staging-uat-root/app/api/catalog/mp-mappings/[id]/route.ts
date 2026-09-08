import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { canEditCatalogPrices, resolveCatalogViewRole } from "@/lib/catalog/catalog-access";
import { getCatalogPb } from "@/lib/catalog/api-server";
import { deleteMpMapping, updateMpMapping } from "@/lib/catalog/mp-mapping-server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await requireCatalogAccess(req);
    const role = resolveCatalogViewRole(auth.user);
    if (!canEditCatalogPrices(auth.user) && role !== "owner") {
      return NextResponse.json({ ok: false, error: "Tidak boleh mengubah mapping." }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      mp_sku?: string;
      mp_product_name?: string;
      product?: string;
      is_active?: boolean;
    };
    const pb = await getCatalogPb();
    const item = await updateMpMapping(pb, id, body);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return jsonError(err, "Gagal memperbarui mapping.");
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const auth = await requireCatalogAccess(req);
    const role = resolveCatalogViewRole(auth.user);
    if (!canEditCatalogPrices(auth.user) && role !== "owner") {
      return NextResponse.json({ ok: false, error: "Tidak boleh menghapus mapping." }, { status: 403 });
    }
    const { id } = await ctx.params;
    const pb = await getCatalogPb();
    await deleteMpMapping(pb, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, "Gagal menghapus mapping.");
  }
}
