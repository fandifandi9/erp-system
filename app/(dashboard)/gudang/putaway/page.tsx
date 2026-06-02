"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Putaway per PO dilakukan di halaman penerimaan. */
export default function GudangPutawayRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poId = searchParams.get("po");

  useEffect(() => {
    if (poId) {
      router.replace(`/gudang/penerimaan/${poId}`);
      return;
    }
    router.replace("/gudang/penerimaan");
  }, [poId, router]);

  return null;
}
