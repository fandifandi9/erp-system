import { serbaIconImageResponse } from "@/lib/serba-pwa-icon";

/** Ikon 192×192 (legacy URL). */
export async function GET() {
  return serbaIconImageResponse({ size: 192 });
}
