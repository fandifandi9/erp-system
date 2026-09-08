import { redirect } from "next/navigation";
import { PURCHASE_MODULE } from "@/lib/bisnis/module-routes";

export default function PembelianHubPage() {
  redirect(PURCHASE_MODULE.tagihan);
}
