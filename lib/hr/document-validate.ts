/**
 * Phase 34E — Private employee document validation (PDF, JPEG, PNG).
 */

export const EMPLOYEE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const EMPLOYEE_DOCUMENT_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type EmployeeDocumentAllowedMime = (typeof EMPLOYEE_DOCUMENT_ALLOWED_MIME)[number];

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

export function sniffDocumentMime(bytes: Uint8Array): EmployeeDocumentAllowedMime | null {
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  return null;
}

export function normalizeDeclaredMime(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
}

const EXT_BY_MIME: Record<EmployeeDocumentAllowedMime, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export function validateEmployeeDocumentBytes(
  bytes: Uint8Array,
  declaredMime: string,
  originalName: string,
  byteLength = bytes.byteLength,
): { ok: true; mime: EmployeeDocumentAllowedMime } | { ok: false; error: string } {
  if (!bytes.length) return { ok: false, error: "File kosong." };
  if (byteLength > EMPLOYEE_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: "Ukuran file melebihi 10 MB." };
  }

  const sniffed = sniffDocumentMime(bytes);
  if (!sniffed) {
    return { ok: false, error: "Tipe file tidak diizinkan. Gunakan PDF, JPEG, atau PNG." };
  }

  const declared = normalizeDeclaredMime(declaredMime);
  if (declared && declared !== "application/octet-stream" && declared !== sniffed) {
    if (!(declared === "image/jpg" && sniffed === "image/jpeg")) {
      return { ok: false, error: "Tipe file tidak sesuai isi file." };
    }
  }

  const ext = originalName.includes(".")
    ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase()
    : "";
  if (ext && !EXT_BY_MIME[sniffed].includes(ext)) {
    return { ok: false, error: "Ekstensi file tidak sesuai tipe isi file." };
  }

  return { ok: true, mime: sniffed };
}
