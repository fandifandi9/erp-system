/**
 * mobile/lib/notifications-api.ts
 * Phase 24 — Mobile client for notifications and push token APIs.
 *
 * All calls go to the ERP web backend (Next.js API routes).
 * Auth is via PocketBase Bearer token.
 */

import { pb } from "@/lib/pocketbase";
import { getErpWebUrl } from "@/lib/inventory/env";

export type NotificationItem = {
  id: string;
  recipient: string;
  type: string;
  title: string;
  body: string;
  resource_type: string;
  resource_id: string;
  action: string;
  read_at: string | null;
  created: string;
};

export type NotificationListResult = {
  ok: boolean;
  items: NotificationItem[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  unreadCount: number;
};

function getErpBase(): string {
  const base = getErpWebUrl();
  if (!base) throw new Error("EXPO_PUBLIC_ERP_WEB_URL not configured.");
  return base;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) {
    headers.Authorization = `Bearer ${pb.authStore.token}`;
  }
  return headers;
}

/** Fetch the authenticated user's notifications. */
export async function fetchNotifications(opts?: {
  page?: number;
  perPage?: number;
  unreadOnly?: boolean;
}): Promise<NotificationListResult> {
  const base = getErpBase();
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.perPage) params.set("perPage", String(opts.perPage));
  if (opts?.unreadOnly) params.set("unread", "1");

  const res = await fetch(`${base}/api/notifications?${params.toString()}`, {
    headers: authHeaders(),
  });
  const json = (await res.json()) as NotificationListResult;
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return json;
}

/** Mark a notification as read. Idempotent. */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const base = getErpBase();
  const res = await fetch(`${base}/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
}

/** Register or update an Expo push token for the current device. */
export async function registerPushToken(opts: {
  token: string;
  platform: "android" | "ios";
  device_id?: string;
}): Promise<void> {
  const base = getErpBase();
  const res = await fetch(`${base}/api/push-tokens`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      token: opts.token,
      platform: opts.platform,
      device_id: opts.device_id ?? "",
    }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
}

/** Deactivate a push token (e.g., on logout or permission revoked). */
export async function deregisterPushToken(opts: {
  token?: string;
  device_id?: string;
}): Promise<void> {
  const base = getErpBase();
  const res = await fetch(`${base}/api/push-tokens`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({
      token: opts.token ?? "",
      device_id: opts.device_id ?? "",
    }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
}
