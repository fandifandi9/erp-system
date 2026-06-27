import { redirect } from "next/navigation";

/** @deprecated Dashboard bisnis dipindah ke modul Penjualan */
export default function BisnisIndexRedirect() {
  redirect("/bisnis/penjualan");
}
