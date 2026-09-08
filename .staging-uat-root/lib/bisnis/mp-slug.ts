/** Slug untuk field `code` di PB — otomatis dari nama, tidak perlu diisi user. */
export function slugFromName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return s || `x_${Date.now()}`;
}

export function storePlatformLabel(
  storeName: string,
  platformName: string,
  tierName: string,
): string {
  return `${storeName} · ${platformName} ${tierName}`.trim();
}
