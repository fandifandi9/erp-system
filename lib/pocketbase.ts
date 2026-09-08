import PocketBase from "pocketbase";

function requirePocketBaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_POCKETBASE_URL || process.env.POCKETBASE_URL || "").trim();
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_POCKETBASE_URL belum diset. Tambahkan ke .env.local sebelum menjalankan aplikasi.",
    );
  }
  return url;
}

const POCKETBASE_URL = requirePocketBaseUrl();

export const pb = new PocketBase(POCKETBASE_URL);

pb.autoCancellation(false);

export { POCKETBASE_URL };
