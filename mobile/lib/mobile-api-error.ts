/** Sentinel when fetch never reaches the ERP API. Mapped to i18n in UI — never shown raw. */
export const MOBILE_OFFLINE = "MOBILE_OFFLINE";
export const REQUEST_FAILED = "REQUEST_FAILED";

export function isRawTechnicalError(msg: string): boolean {
  return /EXPO_PUBLIC|HTTP \s*\d+|ECONN|Failed to fetch|fetch failed|ERP server URL|unconfigured\.invalid|127\.0\.0\.1|localhost|pb-staging\.serba|staging\.serba|pb\.serba|:\d{4}\b|Login admin PocketBase|POCKETBASE_ADMIN|kata sandi admin|superuser|_superusers/i.test(
    msg,
  );
}

export function apiErrorFromJson(json: Record<string, unknown>): string {
  const err = typeof json.error === "string" ? json.error.trim() : "";
  const msg = typeof json.message === "string" ? json.message.trim() : "";
  return err || msg || REQUEST_FAILED;
}

export function mapMobileApiError(error: unknown, fallback: string): string {
  const msg = error instanceof Error ? error.message : String(error || "");
  if (!msg || msg === REQUEST_FAILED || msg === MOBILE_OFFLINE || isRawTechnicalError(msg)) {
    return fallback;
  }
  return msg;
}

type TFn = (key: string) => string;

export function mapRatingApiError(error: unknown, t: TFn): string {
  const msg = error instanceof Error ? error.message : String(error || "");
  if (msg === MOBILE_OFFLINE || /koneksi|offline|network|Failed to fetch|fetch failed|ECONN/i.test(msg)) {
    return t("rating.offline");
  }
  if (/Sudah dikirim dan terkunci/i.test(msg)) return t("rating.alreadyLocked");
  if (/Lengkapi semua aspek/i.test(msg)) return t("rating.incompleteAspects");
  if (/Skor harus/i.test(msg)) return t("rating.scoreRange");
  if (/Bukan tugas Anda|Akses ditolak|Login diperlukan/i.test(msg)) return t("common.error");
  return mapMobileApiError(error, t("common.error"));
}

export function mapReportingApiError(error: unknown, t: TFn): string {
  const msg = error instanceof Error ? error.message : String(error || "");
  if (msg === MOBILE_OFFLINE || /Tidak ada koneksi|No connection|Failed to fetch|fetch failed|ECONN/i.test(msg)) {
    return t("reporting.offline");
  }
  if (/Layanan data sementara|service unavailable/i.test(msg)) {
    return t("reporting.serviceUnavailable");
  }
  if (/Login admin PocketBase|POCKETBASE_ADMIN|kata sandi admin|superuser/i.test(msg)) {
    return t("reporting.serviceUnavailable");
  }
  if (/Ukuran file melebihi/i.test(msg)) return t("reporting.fileTooLarge");
  if (/Tipe file tidak sesuai isi/i.test(msg)) return t("reporting.fileMismatch");
  if (/Tipe file tidak diizinkan/i.test(msg)) return t("reporting.fileType");
  if (/File kosong/i.test(msg)) return t("reporting.fileEmpty");
  if (/Maksimal \d+ gambar|Maximum \d+ images/i.test(msg)) return t("reporting.maxEvidence");
  return mapMobileApiError(error, t("reporting.offline"));
}

export function caseStatusLabel(status: string, t: TFn): string {
  const s = String(status || "").toLowerCase();
  if (s === "draft") return t("reporting.draft");
  if (s === "submitted") return t("reporting.submittedStatus");
  if (s === "in_review") return t("reporting.inReview");
  if (s === "closed") return t("reporting.closed");
  return status || "—";
}
