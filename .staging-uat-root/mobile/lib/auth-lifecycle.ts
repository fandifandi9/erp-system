import { ClientResponseError } from "pocketbase";
import type PocketBase from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { clearMobileSessionNonce } from "@/lib/auth-session";
import { isPocketBaseUnreachable } from "@/lib/errors";
import { clearOfflineQueue } from "@/lib/offline-queue/storage";
import { notifyOfflineQueueChanged } from "@/lib/offline-queue/enqueue";
import { authLog, SESSION_EXPIRED_MESSAGE } from "@/lib/auth-log";

export type AuthRefreshResult = "ok" | "offline" | "expired";

let pendingLoginMessage: string | null = null;
let logoutInProgress = false;
let global401Installed = false;

type SessionExpiredHandler = () => void | Promise<void>;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

export function registerSessionExpiredHandler(
  handler: SessionExpiredHandler | null
): void {
  sessionExpiredHandler = handler;
}

export function consumePendingLoginMessage(): string | null {
  const msg = pendingLoginMessage;
  pendingLoginMessage = null;
  return msg;
}

export async function clearAuthSession(): Promise<void> {
  await clearMobileSessionNonce();
  pb.authStore.clear();
  try {
    await clearOfflineQueue();
    notifyOfflineQueueChanged();
  } catch {
    /* ignore */
  }
}

function isAuthLoginRequest(url: string): boolean {
  return /\/auth-with-password|\/auth-with-otp|\/request-otp/i.test(url);
}

export async function triggerSessionExpired(reason: string): Promise<void> {
  if (logoutInProgress) return;
  logoutInProgress = true;
  authLog.autoLogout(reason);
  pendingLoginMessage = SESSION_EXPIRED_MESSAGE;
  try {
    await clearAuthSession();
    await sessionExpiredHandler?.();
  } finally {
    logoutInProgress = false;
  }
}

export async function refreshAuthToken(
  client: PocketBase = pb
): Promise<AuthRefreshResult> {
  if (!client.authStore.isValid) {
    authLog.authRefreshSkip("token_not_valid_locally");
    return "expired";
  }
  try {
    await client.collection("users").authRefresh();
    authLog.authRefreshSuccess(client.authStore.model?.id);
    return "ok";
  } catch (err: unknown) {
    if (isPocketBaseUnreachable(err)) {
      authLog.authRefreshFail(err, "offline");
      return "offline";
    }
    const status = err instanceof ClientResponseError ? err.status : 0;
    if (status === 401) {
      authLog.authRefreshFail(err, "expired");
      return "expired";
    }
    authLog.authRefreshFail(err, "error");
    return "offline";
  }
}

export function setupGlobal401Handler(client: PocketBase = pb): void {
  if (global401Installed) return;
  global401Installed = true;

  const previousAfterSend = client.afterSend?.bind(client);

  client.afterSend = async (response, data) => {
    const nextData = previousAfterSend
      ? await previousAfterSend(response, data)
      : data;

    if (response.status === 401 && client.authStore.token) {
      const url = response.url ?? "";
      if (!isAuthLoginRequest(url)) {
        void triggerSessionExpired("http_401");
      }
    }

    return nextData;
  };
}

export function logAuthRestoreState(client: PocketBase = pb): void {
  if (client.authStore.isValid) {
    authLog.authRestoreSuccess(client.authStore.model?.id);
    return;
  }
  if (client.authStore.token) {
    authLog.authRestoreInvalid();
    return;
  }
  authLog.authRestoreEmpty();
}
