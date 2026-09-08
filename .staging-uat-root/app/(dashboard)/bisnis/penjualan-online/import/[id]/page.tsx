import { redirect } from "next/navigation";

type Ctx = { params: Promise<{ id: string }> };

/** @deprecated Detail batch dipindah ke /bisnis/penjualan/import/[id] */
export default async function PenjualanOnlineImportBatchRedirect(ctx: Ctx) {
  const { id } = await ctx.params;
  redirect(`/bisnis/penjualan/import/${id}`);
}
