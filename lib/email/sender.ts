import type { Store } from "@/lib/bisnis/types";
import { getResendFromEmail } from "@/lib/email/resend";

/** Pengirim email — siap override per toko (field opsional di master Toko). */
export type EmailSender = {
  /** Format Resend: `Nama Toko <email@domain.com>` */
  from: string;
  replyTo?: string;
};

export type StoreEmailOverrides = Pick<
  Store,
  "name" | "email" | "email_from_name" | "email_from_address"
>;

export function getDefaultFromName(): string {
  return process.env.RESEND_FROM_NAME?.trim() || "SERBA ERP";
}

function formatFromAddress(name: string, email: string): string {
  const safeName = name.replace(/[<>]/g, "").trim();
  if (!safeName || safeName === email) return email;
  return `${safeName} <${email}>`;
}

/**
 * Resolve pengirim: override toko → env global.
 * Nanti isi `email_from_name` / `email_from_address` di PocketBase (biz_stores).
 */
export function resolveEmailSender(store?: StoreEmailOverrides | null): EmailSender {
  const defaultEmail = getResendFromEmail();
  const defaultName = getDefaultFromName();

  const fromEmail = store?.email_from_address?.trim() || defaultEmail;
  const fromName =
    store?.email_from_name?.trim() || store?.name?.trim() || defaultName;

  return {
    from: formatFromAddress(fromName, fromEmail),
    replyTo: store?.email?.trim() || undefined,
  };
}
