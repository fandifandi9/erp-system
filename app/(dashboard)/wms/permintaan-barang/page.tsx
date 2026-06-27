import { redirect } from "next/navigation";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";

export default function PermintaanBarangIndexPage() {
  redirect(PERMINTAAN_BARANG.picking);
}
