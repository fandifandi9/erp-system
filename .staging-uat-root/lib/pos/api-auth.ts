import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";

/** POS memakai hak akses modul penjualan. */
export async function requirePosApiUser(req?: Request) {
  return requirePenjualanApiUser(req);
}
