import { redirect } from "next/navigation";

/** Syarat pembayaran digabung ke metode pembayaran — redirect bookmark lama. */
export default function SyaratBayarRedirectPage() {
  redirect("/bisnis/metode-bayar");
}
