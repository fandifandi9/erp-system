import { ClientResponseError } from "pocketbase";
import { pb } from "./pocketbase";

/**
 * @deprecated Phase 33A — operational flags are updated server-side (admin PB).
 * Legacy client path retained for diagnostics only; will fail under hardened users.updateRule.
 */

async function refreshAuthUserModelFromServer(userId: string): Promise<void> {
  try {
    const token = pb.authStore.token;
    if (!token || pb.authStore.model?.id !== userId) return;
    const fresh = await pb.collection("users").getOne(userId, { requestKey: null });
    pb.authStore.save(token, fresh as never);
  } catch {
    /* offline */
  }
}

export async function syncOperationalAccessAfterCheckIn(userId: string): Promise<{ ok: boolean; error?: string }> {
  const iso = new Date().toISOString();
  try {
    await pb.collection("users").update(userId, {
      is_checked_in: true,
      shift_active: true,
      web_access: true,
      last_checkin: iso,
    });
    await refreshAuthUserModelFromServer(userId);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof ClientResponseError ? e.message : String(e);
    console.warn("[operational-access] check-in: gagal update users:", msg);
    return { ok: false, error: msg };
  }
}

export async function syncOperationalAccessAfterCheckOut(userId: string): Promise<{ ok: boolean; error?: string }> {
  const iso = new Date().toISOString();
  try {
    await pb.collection("users").update(userId, {
      is_checked_in: false,
      shift_active: false,
      web_access: false,
      last_checkout: iso,
    });
    await refreshAuthUserModelFromServer(userId);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof ClientResponseError ? e.message : String(e);
    console.warn("[operational-access] check-out: gagal update users:", msg);
    return { ok: false, error: msg };
  }
}
