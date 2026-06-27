import { redirect } from "next/navigation";

export default function PenjualanOnlineImportRedirect() {
  redirect("/bisnis/penjualan/import?jenis=penjualan");
}
