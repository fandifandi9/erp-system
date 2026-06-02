/** Parse angka desimal format Indonesia: 4,5 · 10,2 · 4.5 */
export function parseIdDecimal(input: string): number {
  const s = input.trim().replace(/\s/g, "").replace(/^Rp\.?\s*/i, "");
  if (!s) return NaN;

  if (s.includes(",")) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return parseFloat(s.replace(/\./g, ""));
  }

  return parseFloat(s);
}

/** Parse nominal Rp: 4000 · 4.000 · 40.000 · Rp 1.250 */
export function parseIdInteger(input: string): number {
  const s = input.trim().replace(/\s/g, "").replace(/^Rp\.?\s*/i, "");
  if (!s) return NaN;

  if (s.includes(",")) {
    const whole = s.split(",")[0] ?? "";
    return parseInt(whole.replace(/\./g, ""), 10);
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return parseInt(s.replace(/\./g, ""), 10);
  }

  return parseInt(s.replace(/\./g, ""), 10);
}

export function formatIdInteger(n: number): string {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

export function formatIdDecimal(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(n);
}
