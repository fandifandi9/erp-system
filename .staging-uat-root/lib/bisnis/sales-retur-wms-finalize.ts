import type PocketBase from "pocketbase";
import { completeSalesRetur } from "@/lib/bisnis/sales-retur-complete";
import type { Retur } from "@/lib/bisnis/types";

/** Auto-proceed setelah WMS match — transfer transit → gudang akhir + pembukuan. */
export async function autoFinalizeSalesReturAfterWms(
  pb: PocketBase,
  returId: string,
  userId: string,
): Promise<Retur> {
  const { retur } = await completeSalesRetur(pb, returId, userId);
  return retur;
}
