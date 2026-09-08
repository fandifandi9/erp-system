/** Phase 35I-M — business calendar day for Mobile (must match server Asia/Jakarta). */
export const BUSINESS_TIMEZONE = "Asia/Jakarta";

export function getBusinessDateYmd(
  at: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
