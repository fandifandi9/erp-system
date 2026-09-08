"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Penempatan produk per slot tidak dipakai — arahkan ke stok gudang. */
export default function GudangProdukDetailRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const productId = typeof params.id === "string" ? params.id : "";

  useEffect(() => {
    if (productId) {
      router.replace(`/katalog/produk/${productId}`);
      return;
    }
    router.replace("/gudang/stok");
  }, [productId, router]);

  return null;
}
