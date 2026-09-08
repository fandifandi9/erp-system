/**
 * Phase 35I-M — Business calendar date (attendance / leave day keys).
 * Always Asia/Jakarta unless an explicit IANA zone is passed.
 * Never use device/browser local TZ for policy day boundaries.
 */

export const BUSINESS_TIMEZONE = "Asia/Jakarta";

/**
 * Calendar YYYY-MM-DD in the business timezone for an instant (default: now).
 */
export function getBusinessDateYmd(
  at: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** True when `ymd` matches the business calendar day for `at`. */
export function isSameBusinessDate(
  ymd: string,
  at: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): boolean {
  return ymd === getBusinessDateYmd(at, timeZone);
}
