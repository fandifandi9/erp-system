import { redirect } from "next/navigation";

/** Legacy Phase 34G page — folded into Perusahaan (same biz_company_profile SSOT). */
export default function IdentitasEntitasRedirectPage() {
  redirect("/pengaturan/perusahaan");
}
