"use client";

import { pb } from "@/lib/pocketbase";

export function reportingAuthHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

export async function reportingFetch(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    const err = new Error("Tidak ada koneksi. Laporan belum dikirim.");
    (err as Error & { offline?: boolean }).offline = true;
    throw err;
  }
}
