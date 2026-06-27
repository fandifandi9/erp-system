"use client";

import type { MpFeeLineFormState } from "@/lib/bisnis/mp-template-client";
import type { MpTemplateLineGroup } from "@/lib/bisnis/types";
import {
  MP_FEE_BASIS_OPTIONS,
  MP_FEE_VALUE_MODE_OPTIONS,
  mpFeeUxFromRecord,
  mpFeeUxToRecord,
  type MpFeeBasis,
  type MpFeeValueMode,
} from "@/lib/bisnis/mp-fee-line-ux";
import { formatIdDecimal, formatIdInteger, parseIdDecimal, parseIdInteger } from "@/lib/format-id-number";

const INPUT_CLS =
  "w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

function formatBlurText(mode: "integer" | "decimal", raw: string): string {
  if (!raw.trim()) return "";
  const n = mode === "integer" ? parseIdInteger(raw) : parseIdDecimal(raw);
  if (!Number.isFinite(n)) return raw;
  return mode === "integer" ? formatIdInteger(Math.round(n)) : formatIdDecimal(n);
}

type Category = { id: string; name: string };

type Props = {
  form: MpFeeLineFormState;
  onChange: (next: MpFeeLineFormState) => void;
  categories?: Category[];
};

export function MpFeeLineFormFields({ form, onChange, categories = [] }: Props) {
  const { basis, valueMode } = mpFeeUxFromRecord(form);

  const setBasis = (nextBasis: MpFeeBasis) => {
    const { calc_type, applies_to } = mpFeeUxToRecord(nextBasis, valueMode);
    onChange({ ...form, calc_type, applies_to });
  };

  const setValueMode = (nextMode: MpFeeValueMode) => {
    const { calc_type, applies_to } = mpFeeUxToRecord(basis, nextMode);
    onChange({ ...form, calc_type, applies_to });
  };

  const basisHint = MP_FEE_BASIS_OPTIONS.find((o) => o.value === basis)?.hint ?? "";

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium">
        Nama biaya
        <input
          required
          value={form.label}
          onChange={(e) => onChange({ ...form, label: e.target.value })}
          className={`mt-1 ${INPUT_CLS}`}
          placeholder="Gratis ongkir / Cashback / Biaya pemrosesan"
        />
      </label>

      {form.line_group === "category" ? (
        <label className="block text-xs font-medium">
          Kategori produk SERBA *
          <select
            required
            value={form.internal_category}
            onChange={(e) => onChange({ ...form, internal_category: e.target.value })}
            className={`mt-1 ${INPUT_CLS}`}
          >
            <option value="">— Pilih —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block text-xs font-medium">
          Grup biaya
          <select
            value={form.line_group}
            onChange={(e) =>
              onChange({
                ...form,
                line_group: e.target.value as MpTemplateLineGroup,
                internal_category: "",
              })
            }
            className={`mt-1 ${INPUT_CLS}`}
          >
            <option value="mp_fee">Biaya marketplace</option>
            <option value="operational">Biaya operasional</option>
          </select>
        </label>
      )}

      <div>
        <label className="block text-xs font-medium">
          Dasar potongan
          <select value={basis} onChange={(e) => setBasis(e.target.value as MpFeeBasis)} className={`mt-1 ${INPUT_CLS}`}>
            {MP_FEE_BASIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {basisHint && <p className="mt-1 text-[11px] text-slate-500">{basisHint}</p>}
      </div>

      <label className="block text-xs font-medium">
        Jenis nilai
        <select
          value={valueMode}
          onChange={(e) => setValueMode(e.target.value as MpFeeValueMode)}
          className={`mt-1 ${INPUT_CLS}`}
        >
          {MP_FEE_VALUE_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {(valueMode === "persen" || valueMode === "persen_plafon") && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-medium">
            Persen (%)
            <input
              value={form.rateText}
              onChange={(e) => onChange({ ...form, rateText: e.target.value })}
              onBlur={() =>
                onChange({ ...form, rateText: formatBlurText("decimal", form.rateText) })
              }
              placeholder="4,5"
              inputMode="decimal"
              className={`mt-1 ${INPUT_CLS}`}
            />
          </label>
          {valueMode === "persen_plafon" && (
            <label className="block text-xs font-medium">
              Plafon maks. (Rp)
              <input
                value={form.maxAmountText}
                onChange={(e) => onChange({ ...form, maxAmountText: e.target.value })}
                onBlur={() =>
                  onChange({ ...form, maxAmountText: formatBlurText("integer", form.maxAmountText) })
                }
                placeholder="40.000"
                inputMode="numeric"
                className={`mt-1 ${INPUT_CLS}`}
              />
            </label>
          )}
        </div>
      )}

      {valueMode === "nominal" && (
        <label className="block text-xs font-medium">
          Nominal (Rp){basis === "per_produk" ? " per qty" : " per pesanan"}
          <input
            value={form.fixedAmountText}
            onChange={(e) => onChange({ ...form, fixedAmountText: e.target.value })}
            onBlur={() =>
              onChange({ ...form, fixedAmountText: formatBlurText("integer", form.fixedAmountText) })
            }
            placeholder="1.250"
            inputMode="numeric"
            className={`mt-1 ${INPUT_CLS}`}
          />
        </label>
      )}

      <p className="text-[11px] text-slate-400">
        Contoh: Gratis ongkir biasanya <strong>per pesanan · persen + plafon</strong>. Komisi per item
        pakai <strong>per produk · persen</strong>.
      </p>
    </div>
  );
}
