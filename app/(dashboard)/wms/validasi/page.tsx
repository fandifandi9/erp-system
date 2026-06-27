import { redirect } from "next/navigation";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";

export default function WmsValidasiRedirectPage() {
  redirect(PERMINTAAN_BARANG.validasi);
}
