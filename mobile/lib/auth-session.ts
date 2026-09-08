import * as SecureStore from "expo-secure-store";
import type PocketBase from "pocketbase";
import { registerMobileSessionViaApi } from "@/lib/session-api";

const MOBILE_SESSION_NONCE_KEY = "erp_pb_session_nonce";

export async function getMobileSessionNonce(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(MOBILE_SESSION_NONCE_KEY);
  } catch {
    return null;
  }
}

export async function setMobileSessionNonce(nonce: string): Promise<void> {
  await SecureStore.setItemAsync(MOBILE_SESSION_NONCE_KEY, nonce);
}

export async function clearMobileSessionNonce(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(MOBILE_SESSION_NONCE_KEY);
  } catch {
    /* ignore */
  }
}

function newNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function registerMobileSessionAfterAuth(
  pb: PocketBase
): Promise<void> {
  const id = pb.authStore.model?.id;
  if (!id) return;

  const apiNonce = await registerMobileSessionViaApi().catch(() => null);
  if (apiNonce) {
    await setMobileSessionNonce(apiNonce);
    return;
  }

  const nonce =
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : newNonce();
  await pb.collection("users").update(id, { mobile_session_nonce: nonce });
  await setMobileSessionNonce(nonce);
}

export async function shouldLogoutMobileSessionMismatch(fresh: {
  mobile_session_nonce?: unknown;
}): Promise<boolean> {
  const server = String(fresh.mobile_session_nonce ?? "").trim();
  if (!server) return false;
  const local = (await getMobileSessionNonce())?.trim() ?? "";
  /** Tanpa nonce lokal jangan langsung logout — bisa race setelah login / SecureStore lambat. */
  if (!local) return false;
  return server !== local;
}

/** Setelah login atau buka app: pastikan nonce lokal ada jika server sudah punya nonce. */
export async function ensureMobileSessionNonceSynced(pb: PocketBase): Promise<void> {
  const id = pb.authStore.model?.id;
  if (!id || !pb.authStore.isValid) return;
  const local = (await getMobileSessionNonce())?.trim() ?? "";
  if (local) return;
  try {
    const fresh = await pb.collection("users").getOne(id, { requestKey: null });
    const server = String(
      (fresh as { mobile_session_nonce?: unknown }).mobile_session_nonce ?? ""
    ).trim();
    if (!server) {
      await registerMobileSessionAfterAuth(pb);
      return;
    }
    await setMobileSessionNonce(server);
  } catch {
    /* offline / rule PB */
  }
}
