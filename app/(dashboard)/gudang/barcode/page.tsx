"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Alihkan ke modul barcode WMS terpusat. */
export default function GudangBarcodeRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/wms/barcode?${qs}` : "/wms/barcode");
  }, [router, searchParams]);

  return null;
}
