/**
 * lib/hr/operational-access-server.ts
 * Phase 33A — Server-only operational user flags (admin PocketBase).
 */

import type PocketBase from "pocketbase";

export async function syncOperationalAccessAfterCheckInServer(
  adminPb: PocketBase,
  userId: string,
): Promise<void> {
  const iso = new Date().toISOString();
  await adminPb.collection("users").update(userId, {
    is_checked_in: true,
    shift_active: true,
    web_access: true,
    last_checkin: iso,
  });
}

export async function syncOperationalAccessAfterCheckOutServer(
  adminPb: PocketBase,
  userId: string,
): Promise<void> {
  const iso = new Date().toISOString();
  await adminPb.collection("users").update(userId, {
    is_checked_in: false,
    shift_active: false,
    web_access: false,
    last_checkout: iso,
  });
}
