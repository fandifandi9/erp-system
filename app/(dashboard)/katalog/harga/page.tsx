import { redirect } from "next/navigation";

/** Harga per toko dipindah ke Edit produk → tab Harga. */
export default function KatalogHargaRedirectPage() {
  redirect("/katalog/produk");
}
