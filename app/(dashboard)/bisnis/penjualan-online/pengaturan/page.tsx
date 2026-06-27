import { redirect } from "next/navigation";

/** @deprecated Platform, tier, dan rumus dipindah ke Master Marketplace */
export default function PengaturanPenjualanOnlineRedirect() {
  redirect("/bisnis/marketplace");
}
