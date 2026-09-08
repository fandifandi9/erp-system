const PREFIX = "serba:ws";

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/i;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

export function parseWorkstationQrPayload(raw: string): { code: string } | null {
  const s = raw.trim();
  if (!s.toLowerCase().startsWith(`${PREFIX}:`)) return null;
  const parts = s.split(":");
  if (parts.length < 3) return null;
  const code = parts.slice(2).join(":").trim();
  if (!code || !CODE_RE.test(code)) return null;
  return { code: normalizeCode(code) };
}

export function isWorkstationQrPayload(raw: string): boolean {
  return parseWorkstationQrPayload(raw) !== null;
}

export function isValidWorkstationCheckInInput(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (parseWorkstationQrPayload(t)) return true;
  if (CODE_RE.test(normalizeCode(t))) return true;
  return false;
}
