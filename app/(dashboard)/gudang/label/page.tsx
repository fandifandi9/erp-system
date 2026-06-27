"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Alihkan ke modul barcode terpusat. */
export default function GudangLabelRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/wms/barcode");
  }, [router]);

  return null;
}
