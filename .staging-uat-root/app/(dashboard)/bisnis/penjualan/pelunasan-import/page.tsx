import { redirect } from "next/navigation";

export default function PelunasanImportRedirect() {
  redirect("/bisnis/penjualan/import?jenis=pelunasan");
}
