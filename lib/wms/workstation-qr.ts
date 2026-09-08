/** Format QR meja validator: `serba:ws:{WORKSTATION_CODE}` */

const PREFIX = "serba:ws";

/** Kode meja: huruf/angka/hyphen/underscore, 2–32 karakter. */
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/i;

export function normalizeWorkstationCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

export function isValidWorkstationCode(code: string): boolean {
  return CODE_RE.test(normalizeWorkstationCode(code));
}

export function buildWorkstationQrPayload(code: string): string {
  const c = normalizeWorkstationCode(code);
  return `${PREFIX}:${c}`;
}

export function parseWorkstationQrPayload(raw: string): { code: string } | null {
  const s = raw.trim();
  if (!s.toLowerCase().startsWith(`${PREFIX}:`)) return null;
  const parts = s.split(":");
  if (parts.length < 3) return null;
  const code = parts.slice(2).join(":").trim();
  if (!code || !isValidWorkstationCode(code)) return null;
  return { code: normalizeWorkstationCode(code) };
}

export function isWorkstationQrPayload(raw: string): boolean {
  return parseWorkstationQrPayload(raw) !== null;
}

/** Terima paste QR penuh atau kode singkat (VALIDATOR-01, PACK-A, …). */
export function normalizeWorkstationCheckInInput(raw: string): {
  qr_payload?: string;
  workstation_code?: string;
} {
  const t = raw.trim();
  if (!t) return {};

  const parsed = parseWorkstationQrPayload(t);
  if (parsed) {
    return { qr_payload: buildWorkstationQrPayload(parsed.code) };
  }

  const upper = normalizeWorkstationCode(t);
  if (isValidWorkstationCode(upper)) {
    return { workstation_code: upper };
  }

  return { qr_payload: t };
}

export function isValidWorkstationCheckInInput(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (parseWorkstationQrPayload(t)) return true;
  if (isValidWorkstationCode(t)) return true;
  return false;
}
