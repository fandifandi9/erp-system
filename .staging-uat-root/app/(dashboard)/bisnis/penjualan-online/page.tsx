import { redirect } from "next/navigation";

/** @deprecated Import massal dipindah ke Penjualan → Import massal */
export default function PenjualanOnlineRedirect() {
  redirect("/bisnis/penjualan/import");
}
