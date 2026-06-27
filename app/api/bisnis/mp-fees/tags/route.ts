import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { createProductTag, listProductTags } from "@/lib/bisnis/mp-sku-fee-server";
import { mpFeeError } from "../respond";

export async function GET(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const url = new URL(req.url);
    const pb = await getInventoryAdminPb();
    const items = await listProductTags(pb, url.searchParams.get("q")?.trim() || undefined);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return mpFeeError(e, "Gagal memuat tag produk.");
  }
}

export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const body = (await req.json()) as { name?: string; products?: string[]; notes?: string };
    const pb = await getInventoryAdminPb();
    const item = await createProductTag(pb, {
      name: body.name ?? "",
      products: body.products,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return mpFeeError(e, "Gagal membuat tag.");
  }
}
