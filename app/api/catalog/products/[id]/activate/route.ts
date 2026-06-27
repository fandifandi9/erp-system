import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { activateCatalogProductRecord } from "@/lib/catalog/api-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await requireCatalogAccess(req);
    const { id } = await ctx.params;
    const item = await activateCatalogProductRecord(auth.user, id);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return jsonError(err, "Gagal mengaktifkan produk.");
  }
}
