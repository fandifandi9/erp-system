/**
 * lib/hr/profile-mutation-server.ts
 * Phase 32 — Server-authoritative self-service profile mutations.
 * Phase 34D — Primary entity resolution, avatar validation, full DTO.
 */

import type PocketBase from "pocketbase";
import { HrApiError } from "@/lib/hr/api-auth";
import { validateAvatarBytes } from "@/lib/hr/avatar-validate";
import { buildProfileAvatarUrl } from "@/lib/hr/profile-avatar-url";
import { fetchPrimaryAdministrativeEntityForUser } from "@/lib/hr/profile-primary-entity";
import {
  buildSelfProfileDto,
  pickSelfServicePayload,
  rejectRestrictedProfileFields,
  type ProfileSelfServiceInput,
  type SelfProfileDto,
} from "@/lib/hr/profile-self-service";

function pbEscapeUserId(userId: string): string {
  return userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function getProfileRowForUser(adminPb: PocketBase, userId: string): Promise<Record<string, unknown>> {
  const rows = await adminPb.collection("profiles").getFullList({
    filter: `user = "${pbEscapeUserId(userId)}"`,
    sort: "-updated",
    requestKey: null,
  });
  if (rows.length === 0) {
    throw new HrApiError("Profil tidak ditemukan. Hubungi HR.", 404);
  }
  return rows[0] as Record<string, unknown>;
}

async function getUserRow(adminPb: PocketBase, userId: string): Promise<Record<string, unknown>> {
  return (await adminPb.collection("users").getOne(userId, { requestKey: null })) as Record<
    string,
    unknown
  >;
}

async function composeSelfProfileDto(
  adminPb: PocketBase,
  userId: string,
  profile: Record<string, unknown>,
): Promise<SelfProfileDto> {
  const [user, primaryEntity] = await Promise.all([
    getUserRow(adminPb, userId),
    fetchPrimaryAdministrativeEntityForUser(adminPb, userId),
  ]);
  const avatarUrl = buildProfileAvatarUrl(
    String(profile.id),
    profile.avatar ? String(profile.avatar) : null,
    profile.updated ? String(profile.updated) : null,
  );
  return buildSelfProfileDto(profile, user, primaryEntity, avatarUrl);
}

export async function serverGetSelfProfile(
  adminPb: PocketBase,
  userId: string,
): Promise<SelfProfileDto> {
  const profile = await getProfileRowForUser(adminPb, userId);
  return composeSelfProfileDto(adminPb, userId, profile);
}

export async function serverUpdateSelfProfile(
  adminPb: PocketBase,
  userId: string,
  body: Record<string, unknown>,
): Promise<SelfProfileDto> {
  rejectRestrictedProfileFields(body);
  const payload = pickSelfServicePayload(body);

  const profile = await getProfileRowForUser(adminPb, userId);
  const profileId = String(profile.id);

  const updateBody: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload) as [keyof ProfileSelfServiceInput, string][]) {
    updateBody[key] = String(value ?? "").trim();
  }

  const updated = (await adminPb.collection("profiles").update(profileId, updateBody, {
    requestKey: null,
  })) as Record<string, unknown>;
  return composeSelfProfileDto(adminPb, userId, updated);
}

export async function serverUpdateSelfAvatar(
  adminPb: PocketBase,
  userId: string,
  formData: FormData,
): Promise<SelfProfileDto> {
  const profile = await getProfileRowForUser(adminPb, userId);
  const profileId = String(profile.id);
  const previousAvatar = profile.avatar ? String(profile.avatar) : null;

  const avatar = formData.get("avatar");
  const fd = new FormData();

  try {
    if (avatar === "" || avatar === null) {
      fd.append("avatar", "");
    } else if (avatar instanceof Blob) {
      if (avatar.size === 0) {
        throw new HrApiError("File avatar tidak valid.", 400);
      }
      const bytes = new Uint8Array(await avatar.arrayBuffer());
      const validated = validateAvatarBytes(bytes, avatar.type || "", avatar.size);
      if (!validated.ok) {
        throw new HrApiError(validated.error, 400);
      }
      const ext =
        validated.mime === "image/png" ? "png" : validated.mime === "image/webp" ? "webp" : "jpg";
      fd.append("avatar", new Blob([bytes], { type: validated.mime }), `avatar.${ext}`);
    } else {
      throw new HrApiError("File avatar tidak valid.", 400);
    }

    const updated = (await adminPb.collection("profiles").update(profileId, fd, {
      requestKey: null,
    })) as Record<string, unknown>;
    return composeSelfProfileDto(adminPb, userId, updated);
  } catch (err) {
    if (err instanceof HrApiError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("avatar") || msg.includes("field") || msg.includes("schema")) {
      throw new HrApiError(
        "Upload avatar gagal — field avatar belum tersedia di database lokal. Jalankan: npm run migrate:local-hr-phase34d",
        500,
      );
    }
    if (previousAvatar) {
      throw new HrApiError(`Upload avatar gagal: ${msg}`, 400);
    }
    throw new HrApiError(`Upload avatar gagal: ${msg}`, 400);
  }
}
