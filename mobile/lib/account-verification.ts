/**
 * Native account verification grant — same 15m rules as web.
 * Token stored in SecureStore; sent as x-account-verified on sensitive API calls.
 */

import * as SecureStore from "expo-secure-store";
import { AppState, type AppStateStatus, type NativeEventSubscription } from "react-native";
import { pb } from "@/lib/pocketbase";
import { requireErpWebUrl } from "@/lib/env";
import {
  ACCOUNT_VERIFICATION_WINDOW_MS,
  ACCOUNT_VERIFICATION_WINDOW_MINUTES,
} from "@/lib/account-verification-session";

export { ACCOUNT_VERIFICATION_WINDOW_MS, ACCOUNT_VERIFICATION_WINDOW_MINUTES };

const TOKEN_KEY = "serba_account_verified_token";
const EXPIRES_KEY = "serba_account_verified_expires";
const LEFT_AT_KEY = "serba_av_module_left_at";
const ACTIVE_MOD_KEY = "serba_av_active_module";

export type SensitiveVerificationModule = "payslip" | "documents";

type Listener = () => void;
const revokeListeners = new Set<Listener>();

let lastActivityAt = Date.now();
let idleTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: NativeEventSubscription | null = null;
let backgroundedAt: number | null = null;

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  return headers;
}

export function bumpAccountVerificationActivity(): void {
  lastActivityAt = Date.now();
}

export function onAccountVerificationRevoked(listener: Listener): () => void {
  revokeListeners.add(listener);
  return () => revokeListeners.delete(listener);
}

function emitRevoked() {
  for (const l of revokeListeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export async function getStoredAccountVerificationToken(): Promise<string | null> {
  try {
    const [token, expRaw] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(EXPIRES_KEY),
    ]);
    if (!token) return null;
    const exp = Number(expRaw ?? 0);
    if (!Number.isFinite(exp) || Date.now() >= exp) {
      await clearStoredAccountVerification();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export async function clearStoredAccountVerification(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(EXPIRES_KEY);
  } catch {
    /* ignore */
  }
}

async function storeToken(token: string): Promise<void> {
  const expiresAt = Date.now() + ACCOUNT_VERIFICATION_WINDOW_MS;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(EXPIRES_KEY, String(expiresAt));
  bumpAccountVerificationActivity();
}

export async function isAccountVerifiedLocally(): Promise<boolean> {
  return Boolean(await getStoredAccountVerificationToken());
}

export async function verifyAccountPasswordMobile(password: string): Promise<void> {
  const base = requireErpWebUrl();
  const res = await fetch(`${base}/api/account/verify`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    token?: string;
  };
  if (!res.ok || data.ok === false || !data.token) {
    throw new Error(data.error || "Verifikasi gagal.");
  }
  await storeToken(data.token);
  ensureIdleWatch();
}

export async function revokeAccountVerificationMobile(): Promise<void> {
  try {
    const base = requireErpWebUrl();
    await fetch(`${base}/api/account/verify`, {
      method: "DELETE",
      headers: authHeaders(),
    }).catch(() => null);
  } finally {
    await clearStoredAccountVerification();
    emitRevoked();
  }
}

export async function accountVerificationHeaders(): Promise<Record<string, string>> {
  const h = authHeaders();
  const token = await getStoredAccountVerificationToken();
  if (token) h["x-account-verified"] = token;
  return h;
}

async function readLeftAt(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(LEFT_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function enterSensitiveModuleMobile(module: SensitiveVerificationModule): Promise<void> {
  const leftAt = await readLeftAt();
  try {
    await SecureStore.setItemAsync(ACTIVE_MOD_KEY, module);
    await SecureStore.deleteItemAsync(LEFT_AT_KEY);
  } catch {
    /* ignore */
  }
  if (leftAt && Date.now() - leftAt >= ACCOUNT_VERIFICATION_WINDOW_MS) {
    await revokeAccountVerificationMobile();
  }
  bumpAccountVerificationActivity();
  ensureIdleWatch();
}

export async function leaveSensitiveModuleMobile(module: SensitiveVerificationModule): Promise<void> {
  try {
    const active = await SecureStore.getItemAsync(ACTIVE_MOD_KEY);
    if (active === module) {
      await SecureStore.deleteItemAsync(ACTIVE_MOD_KEY);
      await SecureStore.setItemAsync(LEFT_AT_KEY, String(Date.now()));
    }
  } catch {
    /* ignore */
  }
}

function onAppState(next: AppStateStatus) {
  if (next === "active") {
    if (backgroundedAt && Date.now() - backgroundedAt >= ACCOUNT_VERIFICATION_WINDOW_MS) {
      void revokeAccountVerificationMobile();
    }
    backgroundedAt = null;
    bumpAccountVerificationActivity();
  } else if (next === "background" || next === "inactive") {
    backgroundedAt = Date.now();
  }
}

function ensureIdleWatch() {
  if (!idleTimer) {
    idleTimer = setInterval(() => {
      void (async () => {
        const token = await getStoredAccountVerificationToken();
        if (!token) return;
        if (Date.now() - lastActivityAt >= ACCOUNT_VERIFICATION_WINDOW_MS) {
          await revokeAccountVerificationMobile();
        }
      })();
    }, 10_000);
  }
  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", onAppState);
  }
}

/** Require a valid grant; throws Error with code ACCOUNT_VERIFICATION_REQUIRED if missing. */
export async function assertAccountVerifiedMobile(): Promise<void> {
  const token = await getStoredAccountVerificationToken();
  if (!token) {
    const err = new Error("Verifikasi akun diperlukan.") as Error & { code?: string };
    err.code = "ACCOUNT_VERIFICATION_REQUIRED";
    throw err;
  }
}
