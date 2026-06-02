"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Alihkan ke modul barcode terpusat. */
export default function GudangLabelRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/gudang/barcode");
  }, [router]);

  return null;
}
