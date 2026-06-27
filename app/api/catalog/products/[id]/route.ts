import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { getCatalogProduct, updateCatalogProductRecord } from "@/lib/catalog/api-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await requireCatalogAccess(req);
    const { id } = await ctx.params;
    const result = await getCatalogProduct(auth.user, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err, "Gagal memuat produk.");
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await requireCatalogAccess(req);
    const { id } = await ctx.params;
    const formData = await req.formData();
    const item = await updateCatalogProductRecord(auth.user, id, formData);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return jsonError(err, "Gagal memperbarui produk.");
  }
}
