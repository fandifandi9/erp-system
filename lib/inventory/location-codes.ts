/** Slug untuk segmen kode lokasi/gudang (huruf, angka, strip). */
export function slugCodePart(text: string, maxLen = 12): string {
  const raw = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();
  const trimmed = raw.replace(/^-+|-+$/g, "").slice(0, maxLen);
  return trimmed || "R";
}

export function suggestWarehouseCode(name: string, existingCodes: string[]): string {
  const used = new Set(existingCodes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const words = name.trim().split(/\s+/).filter(Boolean);
  let base =
    words.length >= 2
      ? words
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 8)
      : slugCodePart(name, 8);
  if (base.length < 2) base = "GDG";
  let code = base;
  let n = 2;
  while (used.has(code)) {
    code = `${base}${n}`;
    n++;
  }
  return code;
}

export function suggestRoomCode(
  warehouseCode: string,
  roomName: string,
  existingCodes: string[],
): string {
  const used = new Set(existingCodes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const whPrefix = slugCodePart(warehouseCode.replace(/-/g, " "), 10);
  const segment = slugCodePart(roomName.replace(/-/g, " "), 12);
  let code = `${whPrefix}-${segment}`;
  let n = 2;
  while (used.has(code)) {
    code = `${whPrefix}-${segment}${n}`;
    n++;
  }
  used.add(code);
  return code;
}

export function parseRoomNamesInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
