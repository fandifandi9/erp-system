import { serbaIconImageResponse } from "@/lib/serba-pwa-icon";

/** Favicon tab browser (32×32) — latar transparan, logo di-zoom agar terbaca. */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  return serbaIconImageResponse({ size: 32, background: "transparent", zoom: 1.9 });
}
