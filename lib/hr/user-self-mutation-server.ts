/**
 * lib/hr/user-self-mutation-server.ts
 * Phase 33A — Server-authoritative self-service user mutations (password, session).
 */

import crypto from "crypto";
import PocketBase from "pocketbase";
import { HrApiError } from "@/lib/hr/api-auth";
import { getPocketBaseUrl } from "@/lib/inventory/pb-server";

export async function serverChangeSelfPassword(
  adminPb: PocketBase,
  userId: string,
  email: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const old = oldPassword.trim();
  const next = newPassword.trim();
  if (!old) throw new HrApiError("Kata sandi lama wajib diisi.", 400);
  if (next.length < 8) {
    throw new HrApiError("Kata sandi baru minimal 8 karakter.", 400);
  }

  const url = getPocketBaseUrl();
  if (!url) throw new HrApiError("PocketBase tidak dikonfigurasi.", 503);

  const verifyPb = new PocketBase(url);
  verifyPb.autoCancellation(false);
  try {
    await verifyPb.collection("users").authWithPassword(email.trim(), old);
  } catch {
    throw new HrApiError("Kata sandi lama tidak benar.", 400);
  }

  const verifiedId = String(verifyPb.authStore.model?.id || "");
  if (verifiedId !== userId) {
    throw new HrApiError("Verifikasi kata sandi gagal.", 400);
  }

  await adminPb.collection("users").update(userId, {
    password: next,
    passwordConfirm: next,
  });
}

export async function serverRegisterWebSessionNonce(
  adminPb: PocketBase,
  userId: string,
): Promise<string> {
  const nonce = crypto.randomUUID();
  await adminPb.collection("users").update(userId, { session_nonce: nonce });
  return nonce;
}

export async function serverRegisterMobileSessionNonce(
  adminPb: PocketBase,
  userId: string,
): Promise<string> {
  const nonce = crypto.randomUUID();
  await adminPb.collection("users").update(userId, { mobile_session_nonce: nonce });
  return nonce;
}
