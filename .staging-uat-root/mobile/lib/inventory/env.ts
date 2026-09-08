/** URL Next.js ERP (untuk API /api/inventory/*). Tanpa slash akhir. */
export function getErpWebUrl(): string {
  const u = (process.env.EXPO_PUBLIC_ERP_WEB_URL ?? "").trim().replace(/\/$/, "");
  return u;
}
