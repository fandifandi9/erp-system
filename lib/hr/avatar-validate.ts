/**
 * Phase 34D — Avatar upload validation (reuses reporting image sniff).
 */

import { validateEvidenceBytes } from "@/lib/hr/reporting-validate";

/** 5 MB — matches profiles.avatar maxSize in schema. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export function validateAvatarBytes(
  bytes: Uint8Array,
  declaredMime: string,
  byteLength = bytes.byteLength,
): { ok: true; mime: "image/jpeg" | "image/png" | "image/webp" } | { ok: false; error: string } {
  if (byteLength > AVATAR_MAX_BYTES) {
    return { ok: false, error: "Ukuran file melebihi 5 MB." };
  }
  const result = validateEvidenceBytes(bytes, declaredMime, byteLength);
  if (!result.ok) return result;
  return { ok: true, mime: result.mime };
}
