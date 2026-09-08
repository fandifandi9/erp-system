import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { listTierDefaults, upsertTierDefault, type FeeFieldsPayload } from "@/lib/bisnis/mp-sku-fee-server";
import { mpFeeError } from "../respond";

export async function GET(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const url = new URL(req.url);
    const pb = await getInventoryAdminPb();
    const items = await listTierDefaults(pb, {
      channelId: url.searchParams.get("channel")?.trim() || undefined,
      tierId: url.searchParams.get("tier")?.trim() || undefined,
    });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return mpFeeError(e, "Gagal memuat default fee tier.");
  }
}

export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const body = (await req.json()) as {
      seller_tier?: string;
      notes?: string;
      is_active?: boolean;
    } & FeeFieldsPayload;
    const pb = await getInventoryAdminPb();
    const item = await upsertTierDefault(pb, { ...body, seller_tier: body.seller_tier ?? "" });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return mpFeeError(e, "Gagal menyimpan default fee tier.");
  }
}
