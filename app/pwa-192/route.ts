import { serbaIconImageResponse } from "@/lib/serba-pwa-icon";

/** Ikon PWA 192×192 — dipakai manifest & komponen header standalone. */
export async function GET() {
  return serbaIconImageResponse({ size: 192 });
}
