import type PocketBase from "pocketbase";

/** Sinkronkan sesi PB ke cookie agar middleware & API Route Next.js bisa baca user. */
export function syncPbAuthCookie(pb: PocketBase): void {
  if (typeof document === "undefined") return;

  if (!pb.authStore.isValid || !pb.authStore.token || !pb.authStore.model) {
    document.cookie = "pb_auth=; path=/; max-age=0; SameSite=Lax";
    return;
  }

  const payload = JSON.stringify({
    token: pb.authStore.token,
    model: pb.authStore.model,
  });
  const maxAge = 60 * 60 * 24 * 30;
  document.cookie = `pb_auth=${encodeURIComponent(payload)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function parsePbAuthCookieValue(raw: string): {
  token?: string;
  model?: Record<string, unknown>;
} | null {
  if (!raw.trim()) return null;
  let decoded = raw.trim();
  try {
    if (decoded.includes("%")) decoded = decodeURIComponent(decoded);
  } catch {
    /* keep raw */
  }
  try {
    const parsed = JSON.parse(decoded) as { token?: string; model?: Record<string, unknown> };
    if (!parsed?.model?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}
