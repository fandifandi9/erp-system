"use client";

import { pb } from "@/lib/pocketbase";
import type { SelfProfileDto } from "@/lib/hr/profile-self-service";

async function parseJson(res: Response) {
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    data?: SelfProfileDto;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  if (!json.data?.id) throw new Error("Respons profil tidak valid.");
  return json.data;
}

function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

export type { SelfProfileDto as SelfProfileData } from "@/lib/hr/profile-self-service";

export async function fetchSelfProfileApi(): Promise<SelfProfileDto> {
  const res = await fetch("/api/profile/self", { headers: authHeaders(false) });
  return parseJson(res);
}

export async function patchSelfProfileApi(body: Record<string, string>): Promise<SelfProfileDto> {
  const res = await fetch("/api/profile/self", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function uploadSelfAvatarApi(file: File | null): Promise<SelfProfileDto> {
  const fd = new FormData();
  fd.append("avatar", file ?? "");
  const res = await fetch("/api/profile/self/avatar", {
    method: "POST",
    headers: authHeaders(false),
    body: fd,
  });
  return parseJson(res);
}

/** Resolve avatar preview URL — prefer server-built URL with cache-bust. */
export function resolveSelfAvatarPreviewUrl(data: SelfProfileDto): string | null {
  if (data.avatar_url) return data.avatar_url;
  if (!data.avatar) return null;
  return pb.files.getURL({ id: data.id, collectionId: "profiles" }, data.avatar, {
    thumb: "200x200",
    ...(data.updated ? { download: false } : {}),
  });
}
