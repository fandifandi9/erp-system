import { redirect } from "next/navigation";

/** Legacy HR path — Struktur Organisasi sekarang di Pengaturan. */
export default function HrOrgStructureRedirectPage() {
  redirect("/pengaturan/organisasi");
}
