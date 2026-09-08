import { ClientResponseError } from "pocketbase";

const TECHNICAL_USER_MESSAGE =
  /EXPO_PUBLIC|HTTP \s*\d+|ECONN|Failed to fetch|fetch failed|ERP server URL|unconfigured\.invalid|127\.0\.0\.1|localhost|pb-staging\.serba|staging\.serba|pb\.serba|:\d{4}\b|Login admin PocketBase|POCKETBASE_ADMIN|kata sandi admin|superuser|_superusers|MOBILE_OFFLINE|REQUEST_FAILED/i;

/** True jika request ke PocketBase tidak sampai ke server (timeout, offline, TLS, dll.). */
export function isPocketBaseUnreachable(error: unknown): boolean {
  if (error instanceof ClientResponseError && error.status === 0) return true;
  if (error instanceof TypeError && String(error.message).toLowerCase().includes("fetch")) return true;
  return false;
}

function isTechnicalUserMessage(msg: string): boolean {
  return TECHNICAL_USER_MESSAGE.test(msg);
}

/** Strip internal/technical text before showing errors to end users. */
export function sanitizeUserFacingMessage(msg: string, fallback: string): string {
  const trimmed = String(msg || "").trim();
  if (!trimmed || isTechnicalUserMessage(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function extractRawErrorMessage(error: unknown): string {
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
    return error.message || "";
  }
  if (error instanceof Error && error.message) return error.message;
  return "";
}

export function getErrorMessage(error: unknown, fallback: string): string {
  const raw = extractRawErrorMessage(error);
  if (!raw) return fallback;
  return sanitizeUserFacingMessage(raw, fallback);
}

/** Pesan singkat untuk login/absensi saat server tidak terjangkau. */
export function pocketBaseUnreachableMessage(error: unknown, serverUrl: string): string | null {
  if (!isPocketBaseUnreachable(error)) return null;
  const host = serverUrl.trim();
  return host
    ? `Tidak terhubung ke server. Periksa internet Anda.`
    : "Server belum dikonfigurasi.";
}
