import PocketBase, { AsyncAuthStore } from "pocketbase";
import * as SecureStore from "expo-secure-store";
import { getPocketBaseUrl } from "./env";
import { authLog } from "./auth-log";

const AUTH_KEY = "pb_auth";

let resolveAuthStoreReady!: () => void;

/** Selesai setelah AsyncAuthStore selesai membaca SecureStore (sukses/gagal). */
export const authStoreReady: Promise<void> = new Promise((resolve) => {
  resolveAuthStoreReady = resolve;
});

async function loadInitialAuthFromSecureStore(): Promise<string | null> {
  authLog.secureStoreLoadStart();
  try {
    const raw = await SecureStore.getItemAsync(AUTH_KEY);
    authLog.secureStoreLoadSuccess(!!raw);
    return raw;
  } catch (err) {
    authLog.secureStoreLoadFail(err);
    return null;
  } finally {
    resolveAuthStoreReady();
  }
}

const authStore = new AsyncAuthStore({
  save: async (serialized) => {
    try {
      await SecureStore.setItemAsync(AUTH_KEY, serialized);
    } catch (err) {
      authLog.secureStoreSaveFail(err);
      throw err;
    }
  },
  clear: async () => {
    try {
      await SecureStore.deleteItemAsync(AUTH_KEY);
    } catch (err) {
      authLog.secureStoreClearFail(err);
    }
  },
  initial: loadInitialAuthFromSecureStore(),
});

export const pb = new PocketBase(getPocketBaseUrl() || "http://127.0.0.1:8090", authStore);

pb.autoCancellation(false);

/** Tunggu restore SecureStore; timeout agar app tidak hang di perangkat lambat. */
export async function waitForAuthStoreReady(timeoutMs = 15_000): Promise<void> {
  await Promise.race([
    authStoreReady,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        authLog.secureStoreLoadFail(new Error("auth_store_ready_timeout"));
        resolve();
      }, timeoutMs);
    }),
  ]);
}
