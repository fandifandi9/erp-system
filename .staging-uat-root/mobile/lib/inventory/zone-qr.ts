const PREFIX = "serba:zone";

export function parseZoneQrPayload(raw: string): { warehouseCode: string; zoneCode: string } | null {
  const s = raw.trim();
  if (!s.toLowerCase().startsWith(`${PREFIX}:`)) return null;
  const parts = s.split(":");
  if (parts.length < 4) return null;
  const warehouseCode = parts[2]?.trim();
  const zoneCode = parts.slice(3).join(":").trim();
  if (!warehouseCode || !zoneCode) return null;
  return { warehouseCode, zoneCode };
}

export function isZoneQrPayload(raw: string): boolean {
  return parseZoneQrPayload(raw) !== null;
}
