/** Format angka bulat Indonesia: 1000000 → "1.000.000" */
export function fmtIdNumber(v: number): string {
  if (!v || Number.isNaN(v)) return "";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(v);
}

export const formatIdInteger = fmtIdNumber;

/** Parse input kasir: "1.000.000" / "1000000" → 1000000 */
export function parseIdNumber(s: string): number {
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export const parseIdInteger = parseIdNumber;

/** Format desimal Indonesia (koma desimal): 4.5 → "4,5" */
export function formatIdDecimal(v: number, maxDecimals = 2): string {
  if (!Number.isFinite(v)) return "";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(v);
}

/** Parse "4,5" / "4.5" / "1.234,56" */
export function parseIdDecimal(s: string): number {
  const trimmed = s.replace(/\s/g, "");
  if (!trimmed) return 0;
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized = trimmed;
  if (lastComma > lastDot) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    const parts = trimmed.split(".");
    if (parts.length > 2) {
      normalized = parts.slice(0, -1).join("").replace(/,/g, "") + "." + parts[parts.length - 1];
    } else {
      normalized = trimmed.replace(/,/g, "");
    }
  } else {
    normalized = trimmed.replace(/\./g, "").replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
