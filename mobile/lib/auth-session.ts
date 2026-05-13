import * as SecureStore from "expo-secure-store";
import type PocketBase from "pocketbase";

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
  const nonce =
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : newNonce();
  await pb.collection("users").update(id, { session_nonce: nonce });
  await setMobileSessionNonce(nonce);
}

export async function shouldLogoutMobileSessionMismatch(fresh: {
  session_nonce?: unknown;
}): Promise<boolean> {
  const server = String(fresh.session_nonce ?? "").trim();
  if (!server) return false;
  const local = (await getMobileSessionNonce())?.trim() ?? "";
  if (!local) return true;
  return server !== local;
}
