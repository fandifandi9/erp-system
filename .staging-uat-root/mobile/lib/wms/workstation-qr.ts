const PREFIX = "serba:ws";

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

const SHORT = /^VALIDATOR-\d+$/i;

export function isValidWorkstationCheckInInput(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (parseWorkstationQrPayload(t)) return true;
  if (SHORT.test(t)) return true;
  if (t.toUpperCase().startsWith("VALIDATOR-")) return true;
  return false;
}
