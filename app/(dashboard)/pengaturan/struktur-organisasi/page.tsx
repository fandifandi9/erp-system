import { redirect } from "next/navigation";

/** Legacy path — mode digabung ke Struktur Organisasi. */
export default function OrgStructureModeRedirectPage() {
  redirect("/pengaturan/organisasi");
}
