/** YYYY-MM-DD helpers for effective-dated payroll bank accounts. */

export function parseYmd(ymd: string): Date | null {
  const s = String(ymd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayYmd(): string {
  return formatYmd(new Date());
}

export function dayBeforeYmd(ymd: string): string | null {
  const dt = parseYmd(ymd);
  if (!dt) return null;
  dt.setDate(dt.getDate() - 1);
  return formatYmd(dt);
}

/** Inclusive range: from <= asOf <= until (until open-ended when empty). */
export function isYmdInEffectiveRange(
  asOfYmd: string,
  fromYmd?: string | null,
  untilYmd?: string | null,
): boolean {
  const asOf = parseYmd(asOfYmd);
  if (!asOf) return false;
  const from = fromYmd ? parseYmd(fromYmd) : null;
  const until = untilYmd ? parseYmd(untilYmd) : null;
  if (from && asOf < from) return false;
  if (until && asOf > until) return false;
  return true;
}

export function validateEffectiveFromYmd(value: string): { ok: true; ymd: string } | { ok: false; error: string } {
  const ymd = String(value ?? "").trim().slice(0, 10);
  if (!parseYmd(ymd)) return { ok: false, error: "Tanggal berlaku tidak valid (YYYY-MM-DD)." };
  return { ok: true, ymd };
}
