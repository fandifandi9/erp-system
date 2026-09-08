/**
 * lib/notifications/push.ts
 * Phase 24 — Expo Push Notification dispatch.
 *
 * Fire-and-forget: push failures are logged but never throw to callers.
 * Invalid tokens are marked inactive in PocketBase.
 *
 * Target: Android (FCM via Expo). iOS-compatible but not UAT target for Phase 24.
 */

import type PocketBase from "pocketbase";
import type { ExpoPushMessage, ExpoPushTicket } from "@/lib/notifications/types";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_TOKENS_COLLECTION = "push_tokens";

/** Validates Expo push token format: ExponentPushToken[...] or ExpoPushToken[...] */
export function isValidExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token.trim());
}

/**
 * Send push notifications to a list of Expo push tokens.
 * Returns partial successes — some tokens may fail independently.
 */
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[],
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.warn("[push] Expo push API error:", res.status);
      return [];
    }
    const data = (await res.json()) as { data?: ExpoPushTicket[] };
    return data.data ?? [];
  } catch (e) {
    console.warn("[push] Expo push fetch error:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * Resolve active push tokens for a set of user IDs.
 * Returns only valid ExponentPushToken format.
 */
export async function getActiveTokensForUsers(
  adminPb: PocketBase,
  userIds: string[],
): Promise<Array<{ userId: string; tokenId: string; token: string }>> {
  if (userIds.length === 0) return [];
  try {
    const filter = userIds
      .map((id) => `user="${id.replace(/"/g, '\\"')}"`)
      .join(" || ");
    const records = await adminPb
      .collection(PUSH_TOKENS_COLLECTION)
      .getFullList<{ id: string; user: string; token: string; is_active: boolean }>({
        filter: `(${filter}) && is_active = true`,
        requestKey: null,
      });
    return records
      .filter((r) => isValidExpoPushToken(r.token))
      .map((r) => ({ userId: r.user, tokenId: r.id, token: r.token }));
  } catch (e) {
    console.warn("[push] getActiveTokensForUsers error:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * Mark a push token as inactive (e.g., after DeviceNotRegistered error from Expo).
 * Fire-and-forget.
 */
export async function deactivateToken(adminPb: PocketBase, tokenId: string): Promise<void> {
  try {
    await adminPb
      .collection(PUSH_TOKENS_COLLECTION)
      .update(tokenId, { is_active: false });
  } catch {
    // Ignore — best effort
  }
}

/**
 * Send push to a list of user IDs with a message payload.
 * Handles token lookup, Expo dispatch, and invalid-token cleanup.
 * Fire-and-forget: never throws.
 */
export async function pushToUsers(
  adminPb: PocketBase,
  userIds: string[],
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const tokenRecords = await getActiveTokensForUsers(adminPb, userIds);
    if (tokenRecords.length === 0) return;

    const messages: ExpoPushMessage[] = tokenRecords.map((r) => ({
      to: r.token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: "default",
      channelId: "erp-notifications",
      priority: "high",
    }));

    const tickets = await sendExpoPushNotifications(messages);

    // Deactivate tokens that Expo reports as invalid
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered"
      ) {
        const record = tokenRecords[i];
        if (record) {
          await deactivateToken(adminPb, record.tokenId);
        }
      }
    }
  } catch (e) {
    console.warn("[push] pushToUsers error:", e instanceof Error ? e.message : String(e));
  }
}
