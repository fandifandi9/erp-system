import { redirect } from "next/navigation";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";

/** Duplikat — dialihkan ke validasi & QC. */
export default function GudangPackingRedirectPage() {
  redirect(PERMINTAAN_BARANG.validasi);
}
