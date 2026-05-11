import { redirect } from "next/navigation";

/** Digabung ke modul satu halaman: `/dashboard-staff/leave?tab=history`. */
export default function LegacyLeaveHistoryRedirect() {
  redirect("/dashboard-staff/leave?tab=history");
}
