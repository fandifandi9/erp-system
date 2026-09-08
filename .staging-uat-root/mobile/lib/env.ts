/** PocketBase base URL (HTTPS di produksi). Diisi lewat `.env` → EXPO_PUBLIC_POCKETBASE_URL */
export function getPocketBaseUrl(): string {
  const u = (process.env.EXPO_PUBLIC_POCKETBASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!u) {
    console.warn(
      "[env] Set EXPO_PUBLIC_POCKETBASE_URL (lihat .env.example) sebelum build produksi."
    );
  }
  return u;
}
