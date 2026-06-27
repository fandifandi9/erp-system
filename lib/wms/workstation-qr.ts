/** Format QR meja validator: `serba:ws:{WORKSTATION_CODE}` */

const PREFIX = "serba:ws";

export function buildWorkstationQrPayload(code: string): string {
  const c = code.trim().toUpperCase();
  return `${PREFIX}:${c}`;
}

export function parseWorkstationQrPayload(raw: string): { code: string } | null {
  const s = raw.trim();
  if (!s.toLowerCase().startsWith(`${PREFIX}:`)) return null;
  const parts = s.split(":");
  if (parts.length < 3) return null;
  const code = parts.slice(2).join(":").trim();
  if (!code) return null;
  return { code: code.toUpperCase() };
}

export function isWorkstationQrPayload(raw: string): boolean {
  return parseWorkstationQrPayload(raw) !== null;
}

const SHORT_CODE = /^VALIDATOR-\d+$/i;

/** Terima paste QR penuh atau kode singkat VALIDATOR-01 */
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

  const upper = t.toUpperCase();
  if (SHORT_CODE.test(upper)) {
    return { workstation_code: upper };
  }

  if (upper.startsWith("VALIDATOR-")) {
    return { workstation_code: upper };
  }

  return { qr_payload: t };
}

export function isValidWorkstationCheckInInput(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (parseWorkstationQrPayload(t)) return true;
  if (SHORT_CODE.test(t)) return true;
  if (t.toUpperCase().startsWith("VALIDATOR-")) return true;
  return false;
}
