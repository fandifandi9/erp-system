/**
 * mobile/lib/profile-self-api.ts — self-service profile via ERP API (Phase 32).
 */

import { pb } from "@/lib/pocketbase";
import { requireErpWebUrl } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";

export type SelfProfileData = {
  id: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  bio?: string;
  avatar?: string;
  name?: string;
  email?: string;
};

function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

async function parse(res: Response) {
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    data?: SelfProfileData;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || getErrorMessage(null, `HTTP ${res.status}`));
  }
  return json.data!;
}

export async function fetchSelfProfileMobile(): Promise<SelfProfileData> {
  const base = requireErpWebUrl();
  const res = await fetch(`${base}/api/profile/self`, { headers: authHeaders(false) });
  return parse(res);
}

export async function patchSelfProfileMobile(body: Record<string, string>): Promise<SelfProfileData> {
  const base = requireErpWebUrl();
  const res = await fetch(`${base}/api/profile/self`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parse(res);
}

export async function uploadSelfAvatarMobile(
  uri: string,
  remove = false,
): Promise<SelfProfileData> {
  const base = requireErpWebUrl();
  const fd = new FormData();
  if (remove) {
    fd.append("avatar", "");
  } else {
    fd.append("avatar", {
      uri,
      name: "avatar.jpg",
      type: "image/jpeg",
    } as unknown as Blob);
  }
  const res = await fetch(`${base}/api/profile/self/avatar`, {
    method: "POST",
    headers: authHeaders(false),
    body: fd,
  });
  return parse(res);
}
