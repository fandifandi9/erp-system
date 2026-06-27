"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Penempatan produk per slot tidak dipakai — stok hanya per gudang. */
export default function GudangProdukRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/gudang/stok");
  }, [router]);

  return null;
}
