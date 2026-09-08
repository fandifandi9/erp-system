"use client";

import { pb } from "@/lib/pocketbase";

export type AccountVerificationStatus = {
  verified: boolean;
  locked: boolean;
  locked_until?: string;
};

function verificationAuthHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  return headers;
}

export async function fetchAccountVerificationStatus(): Promise<AccountVerificationStatus> {
  const res = await fetch("/api/account/verify/status", {
    credentials: "include",
    headers: verificationAuthHeaders(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: AccountVerificationStatus;
    error?: string;
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "Gagal memuat status verifikasi.");
  }
  return data.data ?? { verified: false, locked: false };
}

export async function verifyAccountApi(password: string): Promise<{ token?: string }> {
  const res = await fetch("/api/account/verify", {
    method: "POST",
    credentials: "include",
    headers: verificationAuthHeaders(true),
    body: JSON.stringify({ password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    token?: string;
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "Verifikasi gagal.");
  }
  return { token: data.token };
}

/** Revoke verification grant (idle / leave module / logout companion). */
export async function revokeAccountVerificationApi(): Promise<void> {
  const res = await fetch("/api/account/verify", {
    method: "DELETE",
    credentials: "include",
    headers: verificationAuthHeaders(),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Gagal mencabut verifikasi.");
  }
}

export function isAccountVerificationRequiredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { code?: string }).code === "ACCOUNT_VERIFICATION_REQUIRED";
}

export function errorFromResponse(data: { error?: string; code?: string }): Error & { code?: string } {
  const e = new Error(data.error || "Permintaan ditolak.") as Error & { code?: string };
  e.code = data.code;
  return e;
}
