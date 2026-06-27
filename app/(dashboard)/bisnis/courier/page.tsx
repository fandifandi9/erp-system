import { redirect } from "next/navigation";

/** Alias ke halaman master ekspedisi (courier). */
export default function CourierMasterRedirect() {
  redirect("/bisnis/ekspedisi");
}
