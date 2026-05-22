import { serbaIconImageResponse } from "@/lib/serba-pwa-icon";

/** Ikon 512×512 (legacy URL). */
export async function GET() {
  return serbaIconImageResponse({ size: 512 });
}
