"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Checkout WMS dipindah ke popup di layar keranjang — redirect ke /pos/sale. */
export default function PosCheckoutPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/pos/sale");
  }, [router]);
  return null;
}
