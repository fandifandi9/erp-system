import { serbaIconImageResponse } from "@/lib/serba-pwa-icon";

/** Favicon tab browser (32×32). */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  return serbaIconImageResponse({ size: 32 });
}
