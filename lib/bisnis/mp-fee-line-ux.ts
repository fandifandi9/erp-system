import type { MpFeeAppliesTo, MpFeeCalcType, MpFeeTemplateLine } from "./types";
import { formatIdDecimal, formatIdInteger } from "@/lib/format-id-number";

/** Cara biaya dikenakan: ikut baris produk vs sekali per order. */
export type MpFeeBasis = "per_produk" | "per_pesanan";

/** Cara nilai dihitung: %, Rp, atau % dengan batas atas. */
export type MpFeeValueMode = "persen" | "nominal" | "persen_plafon";

export const MP_FEE_BASIS_OPTIONS: { value: MpFeeBasis; label: string; hint: string }[] = [
  {
    value: "per_produk",
    label: "Per produk",
    hint: "Dihitung per baris item — semakin banyak qty/nilai, semakin besar potongan",
  },
  {
    value: "per_pesanan",
    label: "Per nomor pesanan",
    hint: "Satu kali per order — tidak peduli total qty dalam pesanan yang sama",
  },
];

export const MP_FEE_VALUE_MODE_OPTIONS: { value: MpFeeValueMode; label: string }[] = [
  { value: "persen", label: "Persen (%)" },
  { value: "nominal", label: "Nominal (Rp)" },
  { value: "persen_plafon", label: "Persen (%) dengan plafon maksimum" },
];

export function mpFeeUxFromRecord(row: Pick<MpFeeTemplateLine, "calc_type" | "applies_to">): {
  basis: MpFeeBasis;
  valueMode: MpFeeValueMode;
} {
  const basis: MpFeeBasis = row.applies_to === "line" ? "per_produk" : "per_pesanan";
  let valueMode: MpFeeValueMode;
  if (row.calc_type === "percent_cap") valueMode = "persen_plafon";
  else if (row.calc_type === "percent") valueMode = "persen";
  else valueMode = "nominal";
  return { basis, valueMode };
}

export function mpFeeUxToRecord(
  basis: MpFeeBasis,
  valueMode: MpFeeValueMode,
): { calc_type: MpFeeCalcType; applies_to: MpFeeAppliesTo } {
  const applies_to: MpFeeAppliesTo = basis === "per_produk" ? "line" : "order";
  if (valueMode === "persen_plafon") {
    return { calc_type: "percent_cap", applies_to };
  }
  if (valueMode === "persen") {
    return { calc_type: "percent", applies_to };
  }
  return {
    calc_type: basis === "per_produk" ? "fixed_per_qty" : "fixed",
    applies_to,
  };
}

export function mpFeeBasisLabel(basis: MpFeeBasis): string {
  return basis === "per_produk" ? "Per produk" : "Per pesanan";
}

export function mpFeeLineSummary(
  row: Pick<MpFeeTemplateLine, "calc_type" | "applies_to" | "rate" | "max_amount" | "fixed_amount">,
  fmtCurrency?: (n: number) => string,
): { basis: string; nilai: string } {
  const fmt = fmtCurrency ?? ((n: number) => `Rp ${formatIdInteger(n)}`);
  const { basis, valueMode } = mpFeeUxFromRecord(row);
  const basisLabel = mpFeeBasisLabel(basis);

  if (valueMode === "persen") {
    return { basis: basisLabel, nilai: `${formatIdDecimal(row.rate ?? 0)}%` };
  }
  if (valueMode === "persen_plafon") {
    const max = row.max_amount ? ` · max ${fmt(row.max_amount)}` : "";
    return { basis: basisLabel, nilai: `${formatIdDecimal(row.rate ?? 0)}%${max}` };
  }
  const unit = basis === "per_produk" ? " / qty" : " / pesanan";
  return { basis: basisLabel, nilai: `${fmt(row.fixed_amount ?? 0)}${unit}` };
}
