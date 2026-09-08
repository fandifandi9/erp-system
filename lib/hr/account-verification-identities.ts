/**
 * Resolve PocketBase login identities for password verification.
 * Must mirror /login (email lowercased) and support username fallback.
 */

import type PocketBase from "pocketbase";

export function collectPasswordVerificationIdentities(
  user: Record<string, unknown>,
): string[] {
  const email = String(user.email ?? "").trim();
  const username = String(user.username ?? "").trim();
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };

  if (email) {
    add(email.toLowerCase());
    if (email !== email.toLowerCase()) add(email);
  }
  if (username) add(username);

  return out;
}

export async function refreshUserAuthFields(
  adminPb: PocketBase,
  userId: string,
  fallback: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const rec = (await adminPb.collection("users").getOne(userId, {
      fields: "id,email,username",
      requestKey: null,
    })) as Record<string, unknown>;
    return { ...fallback, ...rec };
  } catch {
    return fallback;
  }
}

export async function pocketBaseAuthWithPassword(
  baseUrl: string,
  identity: string,
  password: string,
): Promise<boolean> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, password }),
  });
  return res.ok;
}
