import type PocketBase from "pocketbase";
import { clearWebSessionNonce } from "@/lib/auth-session";
import { mergeAuthModelPreservingModuleAccess } from "@/lib/access/context";

/** POST session + GET restore — model enriched dengan module_web_paths (tanpa timpa PB mentah). */
export async function refreshEnrichedAuthSession(
  pb: PocketBase,
  token: string,
): Promise<Record<string, unknown> | null> {
  if (typeof document === "undefined" || !token.trim()) return null;

  try {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        model: pb.authStore.model ?? {},
      }),
    });
    if (!res.ok) return null;
    const ok = await restoreAuthFromHttpOnlyCookie(pb, { force: true });
    return ok ? ((pb.authStore.model as Record<string, unknown>) ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Setelah authRefresh/getOne: merge enrichment sementara, lalu refresh dari server.
 * Mencegah race guard yang membaca model PB mentah tanpa module_web_paths.
 */
export async function syncAuthStoreFromPbRecord(
  pb: PocketBase,
  token: string,
  pbRecord: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const prev = pb.authStore.model as Record<string, unknown> | null;
  pb.authStore.save(token, mergeAuthModelPreservingModuleAccess(pbRecord, prev) as never);
  const enriched = await refreshEnrichedAuthSession(pb, token);
  if (enriched) return enriched;
  return (pb.authStore.model ?? pbRecord) as Record<string, unknown>;
}

/** Sinkronkan sesi PB ke cookie HttpOnly via API + muat ulang model enriched (module access). */
export async function syncPbAuthCookie(pb: PocketBase): Promise<void> {
  if (typeof document === "undefined") return;

  if (!pb.authStore.isValid || !pb.authStore.token || !pb.authStore.model) {
    document.cookie = "pb_auth=; path=/; max-age=0; SameSite=Lax";
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    const enriched = await refreshEnrichedAuthSession(pb, pb.authStore.token);
    if (!enriched) {
      throw new Error("session enrich failed");
    }
  } catch {
    /* fallback legacy cookie for local dev without API */
    const payload = JSON.stringify({
      token: pb.authStore.token,
      model: pb.authStore.model,
    });
    const maxAge = 60 * 60 * 24 * 30;
    document.cookie = `pb_auth=${encodeURIComponent(payload)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
}

/**
 * Bersihkan sesi client sepenuhnya: nonce lokal, authStore PB, dan cookie HttpOnly.
 * Dipakai saat logout / token invalid agar middleware tidak tetap menganggap user login.
 */
export async function clearClientAuthSession(pb: PocketBase): Promise<void> {
  clearWebSessionNonce();
  pb.authStore.clear();
  // syncPbAuthCookie pada state invalid → DELETE /api/auth/session (HttpOnly) + hapus cookie legacy.
  await syncPbAuthCookie(pb);
}

/**
 * Pulihkan `pb.authStore` dari cookie HttpOnly (server memvalidasi token via authRefresh).
 * `force: true` — selalu ambil model terbaru (termasuk module_web_paths setelah assignment).
 */
export async function restoreAuthFromHttpOnlyCookie(
  pb: PocketBase,
  options?: { force?: boolean },
): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (
    !options?.force &&
    pb.authStore.isValid &&
    pb.authStore.token &&
    pb.authStore.model
  ) {
    return true;
  }

  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      token?: string;
      model?: Record<string, unknown>;
    };
    if (!data.token?.trim() || !data.model?.id) return false;
    pb.authStore.save(data.token, data.model as never);
    return pb.authStore.isValid && Boolean(pb.authStore.model?.id);
  } catch {
    return false;
  }
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
