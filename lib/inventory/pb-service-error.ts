/**
 * Server-side PocketBase service errors — safe for API clients (mobile/web).
 * Never expose admin credentials, login hints, or internal PB auth details.
 */

export const PB_SERVICE_UNAVAILABLE_MESSAGE =
  "Layanan data sementara tidak tersedia. Coba lagi beberapa saat atau hubungi HR.";

export class PbServiceUnavailableError extends Error {
  readonly status = 503;

  constructor(message: string = PB_SERVICE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "PbServiceUnavailableError";
  }
}

/** Detect internal/server-only error text that must not reach clients. */
export function isSensitivePbServerMessage(msg: string): boolean {
  return /Login admin PocketBase|POCKETBASE_ADMIN|kata sandi admin|admin salah|superuser|_superusers|auth-with-password/i.test(
    msg,
  );
}

export function toClientSafeServiceError(err: unknown): PbServiceUnavailableError | null {
  if (err instanceof PbServiceUnavailableError) return err;
  const msg = err instanceof Error ? err.message : String(err || "");
  if (!msg.trim()) return null;
  if (isSensitivePbServerMessage(msg)) {
    return new PbServiceUnavailableError();
  }
  if (/POCKETBASE_ADMIN_EMAIL dan POCKETBASE_ADMIN_PASSWORD wajib/i.test(msg)) {
    return new PbServiceUnavailableError();
  }
  if (/NEXT_PUBLIC_POCKETBASE_URL belum diset/i.test(msg)) {
    return new PbServiceUnavailableError();
  }
  return null;
}
