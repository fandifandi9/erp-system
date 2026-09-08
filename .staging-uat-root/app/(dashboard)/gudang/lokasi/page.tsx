"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Lokasi rak tidak dipakai — stok hanya per gudang. */
export default function GudangLokasiRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/gudang/daftar");
  }, [router]);

  return null;
}
