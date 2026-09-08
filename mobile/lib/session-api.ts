/**
 * mobile/lib/session-api.ts — ERP session nonce API (server-authoritative).
 */

import { pb } from "@/lib/pocketbase";
import { requireErpWebUrl } from "@/lib/env";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) {
    headers.Authorization = `Bearer ${pb.authStore.token}`;
  }
  return headers;
}

export async function registerMobileSessionViaApi(): Promise<string | null> {
  const base = requireErpWebUrl();
  const res = await fetch(`${base}/api/auth/session/mobile`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; nonce?: string };
  if (!res.ok || !data.nonce) return null;
  return data.nonce;
}

export async function changeSelfPasswordViaApi(input: {
  oldPassword: string;
  password: string;
  passwordConfirm: string;
}): Promise<{ ok: boolean; error?: string }> {
  const base = requireErpWebUrl();
  const res = await fetch(`${base}/api/profile/self/password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}
