import { redirect } from "next/navigation";
import { PURCHASE_MODULE } from "@/lib/bisnis/module-routes";

export default function PurchaseOrderRedirectPage() {
  redirect(PURCHASE_MODULE.pesanan);
}
