import { THERMAL_LABEL_PRESETS } from "./barcode-label-engine";

export type LabelSizeOption = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  isCustom?: boolean;
};

const STORAGE_KEY = "erp-barcode-custom-label-sizes";

export const ADD_LABEL_SIZE_ID = "__add_new__";

export function formatLabelSizeName(widthMm: number, heightMm: number): string {
  return `${widthMm} × ${heightMm} mm`;
}

export function clampLabelMm(n: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(10, Math.min(120, Math.round(v)));
}

export function builtinLabelSizeOptions(): LabelSizeOption[] {
  return THERMAL_LABEL_PRESETS.map((p) => ({
    id: `builtin-${p.widthMm}x${p.heightMm}`,
    label: p.label,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
  }));
}

export function loadCustomLabelSizes(): LabelSizeOption[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LabelSizeOption[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s?.id && s.widthMm && s.heightMm)
      .map((s) => ({
        id: s.id,
        label: s.label || formatLabelSizeName(s.widthMm, s.heightMm),
        widthMm: clampLabelMm(s.widthMm, 30),
        heightMm: clampLabelMm(s.heightMm, 20),
        isCustom: true,
      }));
  } catch {
    return [];
  }
}

export function persistCustomLabelSizes(custom: LabelSizeOption[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
}

export function mergeLabelSizeOptions(custom: LabelSizeOption[]): LabelSizeOption[] {
  const builtins = builtinLabelSizeOptions();
  const seen = new Set(builtins.map((b) => `${b.widthMm}x${b.heightMm}`));
  const extra: LabelSizeOption[] = [];
  for (const c of custom) {
    const key = `${c.widthMm}x${c.heightMm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(c);
  }
  return [...builtins, ...extra];
}

export function findSizeOption(
  options: LabelSizeOption[],
  id: string,
): LabelSizeOption | undefined {
  return options.find((o) => o.id === id);
}

/** Tambah ukuran manual; kembalikan daftar custom + opsi yang dipilih. */
export function appendCustomLabelSize(
  custom: LabelSizeOption[],
  widthMm: number,
  heightMm: number,
): { custom: LabelSizeOption[]; added: LabelSizeOption } {
  const w = clampLabelMm(widthMm, 30);
  const h = clampLabelMm(heightMm, 20);
  const existing = custom.find((c) => c.widthMm === w && c.heightMm === h);
  if (existing) return { custom, added: existing };

  const added: LabelSizeOption = {
    id: `custom-${w}x${h}-${Date.now()}`,
    label: `${formatLabelSizeName(w, h)} (kustom)`,
    widthMm: w,
    heightMm: h,
    isCustom: true,
  };
  const next = [...custom, added];
  persistCustomLabelSizes(next);
  return { custom: next, added };
}

export function removeCustomLabelSize(custom: LabelSizeOption[], id: string): LabelSizeOption[] {
  const next = custom.filter((c) => c.id !== id);
  persistCustomLabelSizes(next);
  return next;
}
