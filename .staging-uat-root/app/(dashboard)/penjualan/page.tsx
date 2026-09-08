import { redirect } from "next/navigation";
import { SALES_MODULE } from "@/lib/bisnis/module-routes";

export default function PenjualanHubPage() {
  redirect(SALES_MODULE.penagihan);
}
