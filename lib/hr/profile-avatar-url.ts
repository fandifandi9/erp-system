/**
 * Phase 34D — PocketBase profile avatar URL with safe cache-busting.
 */

import { getPocketBaseUrl } from "@/lib/inventory/pb-server";

export function buildProfileAvatarUrl(
  profileId: string,
  avatarFilename: string | undefined | null,
  updated?: string | null,
  thumb = "200x200",
): string | null {
  if (!profileId || !avatarFilename) return null;
  const base = getPocketBaseUrl()?.replace(/\/$/, "");
  if (!base) return null;
  const file = encodeURIComponent(String(avatarFilename));
  const params = new URLSearchParams({ thumb });
  if (updated) params.set("v", String(updated));
  return `${base}/api/files/profiles/${profileId}/${file}?${params.toString()}`;
}
