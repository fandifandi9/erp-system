import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { deleteProductFee, updateProductFee, type FeeFieldsPayload } from "@/lib/bisnis/mp-sku-fee-server";
import { mpFeeError } from "../../respond";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as Partial<{ notes: string; is_active: boolean }> & FeeFieldsPayload;
    const pb = await getInventoryAdminPb();
    const item = await updateProductFee(pb, id, body);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return mpFeeError(e, "Gagal mengubah fee SKU.");
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    const pb = await getInventoryAdminPb();
    await deleteProductFee(pb, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mpFeeError(e, "Gagal menghapus fee SKU.");
  }
}
