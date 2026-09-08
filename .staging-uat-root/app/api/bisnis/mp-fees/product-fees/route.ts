import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { listProductFees, upsertProductFee, type FeeFieldsPayload } from "@/lib/bisnis/mp-sku-fee-server";
import { mpFeeError } from "../respond";

export async function GET(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const url = new URL(req.url);
    const pb = await getInventoryAdminPb();
    const res = await listProductFees(pb, {
      channelId: url.searchParams.get("channel")?.trim() || undefined,
      tierId: url.searchParams.get("tier")?.trim() || undefined,
      q: url.searchParams.get("q")?.trim() || undefined,
      tagId: url.searchParams.get("tag")?.trim() || undefined,
      page: Number(url.searchParams.get("page")) || 1,
      perPage: Number(url.searchParams.get("perPage")) || 50,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return mpFeeError(e, "Gagal memuat fee per SKU.");
  }
}

export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const body = (await req.json()) as {
      seller_tier?: string;
      product?: string;
      notes?: string;
      is_active?: boolean;
    } & FeeFieldsPayload;
    const pb = await getInventoryAdminPb();
    const item = await upsertProductFee(pb, {
      ...body,
      seller_tier: body.seller_tier ?? "",
      product: body.product ?? "",
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return mpFeeError(e, "Gagal menyimpan fee SKU.");
  }
}
