"use client";

import { useEffect } from "react";

/**
 * Lepas instalasi PWA lama: hapus service worker & cache agar situs hanya dipakai sebagai web biasa.
 */
export default function WebPwaCleanup() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const cleanup = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        // abaikan — tidak kritis
      }
    };

    void cleanup();
  }, []);

  return null;
}
