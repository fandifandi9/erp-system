import { ClientResponseError } from "pocketbase";

/** Safe message for logging / UI from caught unknown errors. */
export function getErrorMessage(error: unknown, fallback = "Terjadi kesalahan"): string {
  if (error instanceof ClientResponseError) {
    const data = error.response?.data as
      | { message?: string; data?: Record<string, unknown> }
      | undefined;
    if (data?.message && typeof data.message === "string") {
      return data.message;
    }
    if (error.status === 403 || error.status === 401) {
      return `Akses ditolak (${error.status}). Periksa rule PocketBase untuk koleksi ini atau login ulang.`;
    }
    if (error.status === 404) {
      return "Data tidak ditemukan di PocketBase (404).";
    }
    if (error.message?.includes("Failed to fetch") || error.status === 0) {
      return "Tidak terhubung ke PocketBase. Periksa URL jaringan dan pastikan server PocketBase berjalan.";
    }
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}
