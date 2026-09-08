import { redirect } from "next/navigation";
import { SALES_MODULE } from "@/lib/bisnis/module-routes";

export default function InvoiceRedirectPage() {
  redirect(SALES_MODULE.penagihan);
}
