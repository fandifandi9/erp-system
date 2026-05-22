import { ClientResponseError } from "pocketbase";

/** True jika request ke PocketBase tidak sampai ke server (timeout, offline, TLS, dll.). */
export function isPocketBaseUnreachable(error: unknown): boolean {
  if (error instanceof ClientResponseError && error.status === 0) return true;
  if (error instanceof TypeError && String(error.message).toLowerCase().includes("fetch")) return true;
  return false;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ClientResponseError) {
    const msg = error.response?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    const data = error.response?.data;
    if (data && typeof data === "object") {
      for (const v of Object.values(data)) {
        if (typeof v === "object" && v && "message" in v) {
          const m = (v as { message?: string }).message;
          if (typeof m === "string" && m.trim()) return m;
        }
      }
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Pesan singkat untuk login/absensi saat server tidak terjangkau. */
export function pocketBaseUnreachableMessage(error: unknown, serverUrl: string): string | null {
  if (!isPocketBaseUnreachable(error)) return null;
  const host = serverUrl.trim() || "PocketBase";
  return `Tidak terhubung ke ${host}. Periksa internet, firewall, dan pastikan server PocketBase online (HTTPS).`;
}
