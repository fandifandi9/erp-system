import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { bulkUpsertProductFees, type FeeFieldsPayload } from "@/lib/bisnis/mp-sku-fee-server";
import { mpFeeError } from "../../respond";

/** Bulk update fee per tag atau daftar produk. Tag hanya alat bantu memilih SKU. */
export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const body = (await req.json()) as {
      seller_tier?: string;
      product_ids?: string[];
      tag_id?: string;
    } & FeeFieldsPayload;
    const pb = await getInventoryAdminPb();
    const result = await bulkUpsertProductFees(pb, {
      ...body,
      seller_tier: body.seller_tier ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return mpFeeError(e, "Gagal bulk update fee.");
  }
}
