import { redirect } from "next/navigation";

/** Digabung ke modul satu halaman: `/dashboard-staff/leave`. */
export default function LegacyLeaveRequestRedirect() {
  redirect("/dashboard-staff/leave");
}
