import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { canEditCatalogPrices, resolveCatalogViewRole } from "@/lib/catalog/catalog-access";
import { getBundleLinesForCatalog, replaceBundleLines } from "@/lib/catalog/bundle-lines";
import type { BundleLineInput } from "@/lib/catalog/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireCatalogAccess(req);
    const { id } = await ctx.params;
    const lines = await getBundleLinesForCatalog(id);
    return NextResponse.json({ ok: true, lines });
  } catch (err) {
    return jsonError(err, "Gagal memuat komponen bundle.");
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const auth = await requireCatalogAccess(req);
    if (!canEditCatalogPrices(auth.user) && resolveCatalogViewRole(auth.user) !== "owner") {
      return NextResponse.json({ ok: false, error: "Tidak boleh mengubah komponen bundle." }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = (await req.json()) as { lines?: BundleLineInput[] };
    const lines = await replaceBundleLines(id, body.lines ?? []);
    return NextResponse.json({ ok: true, lines });
  } catch (err) {
    return jsonError(err, "Gagal menyimpan komponen bundle.");
  }
}
