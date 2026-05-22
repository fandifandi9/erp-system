/**
 * Versi tampilan produk (watermark dashboard).
 * Override build web: set `NEXT_PUBLIC_APP_VERSION` (contoh `v2.9`).
 * Native: sesuaikan `APP_VERSION_NATIVE` di `mobile/lib/app-version.ts` agar selaras.
 */
export const APP_VERSION_FALLBACK = "v2.8";

export function getAppVersionDisplay(): string {
  if (typeof process !== "undefined") {
    const v = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
    if (v) return v;
  }
  return APP_VERSION_FALLBACK;
}
