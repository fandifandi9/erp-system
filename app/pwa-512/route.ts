import { serbaIconImageResponse } from "@/lib/serba-pwa-icon";

/** Ikon PWA 512×512 — instal Android / splash / maskable. */
export async function GET() {
  return serbaIconImageResponse({ size: 512 });
}
