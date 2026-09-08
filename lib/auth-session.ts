import type PocketBase from "pocketbase";

/** Disimpan di `localStorage` setelah login sukses; harus sama dengan `users.session_nonce` di PB. */
export const WEB_SESSION_NONCE_KEY = "erp_pb_session_nonce";

export function getWebSessionNonce(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(WEB_SESSION_NONCE_KEY);
  } catch {
    return null;
  }
}

export function setWebSessionNonce(nonce: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WEB_SESSION_NONCE_KEY, nonce);
  } catch {
    /* ignore */
  }
}

export function clearWebSessionNonce(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(WEB_SESSION_NONCE_KEY);
  } catch {
    /* ignore */
  }
}

function newNonce(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Setelah auth sukses: rotasi nonce di server → perangkat lain dengan token lama
 * tidak punya nonce yang cocok (cek di guard + realtime).
 */
export async function registerWebSessionAfterAuth(pb: PocketBase): Promise<void> {
  const id = pb.authStore.model?.id;
  if (!id) return;
  const token = pb.authStore.token;
  if (!token) return;

  const res = await fetch("/api/auth/session/web", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; nonce?: string };
  if (res.ok && data.nonce) {
    setWebSessionNonce(data.nonce);
    return;
  }

  // Fallback: direct PB (legacy local before migration)
  const nonce = newNonce();
  await pb.collection("users").update(id, { session_nonce: nonce });
  setWebSessionNonce(nonce);
}

/**
 * `fresh` dari getOne users. Jika server sudah punya nonce dan tidak cocok dengan lokal → sesi lain menang.
 */
/**
 * Sesi diganti perangkat lain (nonce server ≠ lokal).
 * Jika lokal kosong, jangan langsung logout — guard bisa sync dari server setelah getOne.
 */
export function shouldLogoutForSessionMismatch(fresh: {
  session_nonce?: unknown;
}): boolean {
  const server = String(fresh.session_nonce ?? "").trim();
  if (!server) return false;
  const local = getWebSessionNonce()?.trim() ?? "";
  if (!local) return false;
  return server !== local;
}

/** Set nonce lokal dari data user terbaru bila belum ada di localStorage. */
export function syncWebSessionNonceFromUser(fresh: { session_nonce?: unknown }): void {
  const server = String(fresh.session_nonce ?? "").trim();
  if (!server) return;
  if (getWebSessionNonce()?.trim()) return;
  setWebSessionNonce(server);
}
