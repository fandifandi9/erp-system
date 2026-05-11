"use client";

import { useEffect } from "react";

/**
 * Registrasi service worker untuk PWA (install ke layar utama).
 * Hanya di production build atau saat akses HTTPS / localhost.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const { protocol, hostname } = window.location;
    const secure = protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
    if (!secure) return;

    const isProd = process.env.NODE_ENV === "production";
    if (!isProd) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  return null;
}
