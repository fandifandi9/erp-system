import { ClientResponseError } from "pocketbase";

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
