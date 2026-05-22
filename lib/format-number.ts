/** Format angka bulat gaya Indonesia: 1000 → 1.000 */
export function formatIntegerId(value: number | string | null | undefined): string {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/\D/g, ""))
        : 0;
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Parse input yang boleh berisi titik/koma pemisah ribuan. */
export function parseIntegerInput(raw: string): number {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? 0 : n;
}
