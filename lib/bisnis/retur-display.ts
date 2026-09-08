import type { Retur } from "@/lib/bisnis/types";

/** Nomor yang ditampilkan ke bisnis/WMS: platform dulu, fallback RET sistem. */
export function returDisplayNo(
  retur: Pick<Retur, "retur_no" | "platform_retur_no">,
): string {
  const platform = retur.platform_retur_no?.trim();
  return platform || retur.retur_no;
}

/** True jika nomor tampilan berasal dari platform (bukan RET sistem). */
export function returHasPlatformNo(
  retur: Pick<Retur, "platform_retur_no">,
): boolean {
  return Boolean(retur.platform_retur_no?.trim());
}
