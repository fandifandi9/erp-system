import {
  REPORTING_ALLOWED_MIME,
  REPORTING_MAX_FILE_BYTES,
  type ReportingAllowedMime,
} from "@/lib/hr/reporting-types";

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

export function sniffImageMime(bytes: Uint8Array): ReportingAllowedMime | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function normalizeDeclaredMime(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
}

export function validateEvidenceBytes(
  bytes: Uint8Array,
  declaredMime: string,
  byteLength = bytes.byteLength,
): { ok: true; mime: ReportingAllowedMime } | { ok: false; error: string } {
  if (!bytes.length) {
    return { ok: false, error: "File kosong." };
  }
  if (byteLength > REPORTING_MAX_FILE_BYTES) {
    return { ok: false, error: "Ukuran file melebihi 10 MB." };
  }
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) {
    return { ok: false, error: "Tipe file tidak diizinkan. Gunakan JPEG, PNG, atau WebP." };
  }
  const declared = normalizeDeclaredMime(declaredMime);
  if (declared && declared !== "application/octet-stream" && declared !== sniffed) {
    if (!(declared === "image/jpg" && sniffed === "image/jpeg")) {
      return { ok: false, error: "Tipe file tidak sesuai isi file." };
    }
  }
  if (!REPORTING_ALLOWED_MIME.includes(sniffed)) {
    return { ok: false, error: "Tipe file tidak diizinkan. Gunakan JPEG, PNG, atau WebP." };
  }
  return { ok: true, mime: sniffed };
}

export function attachmentLimitMessage(count: number, max: number, locale: "id" | "en" = "id"): string {
  if (locale === "en") {
    return `Maximum ${max} images. Evidence is already ${count} / ${max}.`;
  }
  return `Maksimal ${max} gambar. Bukti sudah ${count} / ${max}.`;
}
