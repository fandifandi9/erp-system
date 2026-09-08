import { redirect } from "next/navigation";

/** Legacy path — approval moved under Pengaturan. */
export default function HrPayrollBankRedirectPage() {
  redirect("/pengaturan/persetujuan-rekening");
}
