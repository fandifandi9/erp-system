import { serbaIconImageResponse } from "@/lib/serba-pwa-icon";

/** Apple Touch / ikon “Tambahkan ke Layar Utama” iOS — 180×180, tanpa transparansi di tepi. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return serbaIconImageResponse({ size: 180 });
}
