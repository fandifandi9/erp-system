import { redirect } from "next/navigation";

/** Lawas: stok bisnis → gudang terpusat */
export default function BisnisStokRedirect() {
  redirect("/gudang/stok");
}