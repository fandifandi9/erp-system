import { redirect } from "next/navigation";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";

/** Duplikat — dialihkan ke validasi & QC dalam Permintaan Barang. */
export default function WmsPackingRedirectPage() {
  redirect(PERMINTAAN_BARANG.validasi);
}
