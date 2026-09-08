import { pb } from "@/lib/pocketbase";
import { ClientResponseError } from "pocketbase";
import { BISNIS_COLLECTIONS, type MpFeeTemplate, type MpFeeTemplateLine } from "./types";
import { formatIdDecimal, formatIdInteger, parseIdDecimal, parseIdInteger } from "@/lib/format-id-number";

import { slugFromName } from "./mp-slug";

type ListOpts = { filter?: string; expand?: string; sort?: string };

export function tierBundleLabel(platformName: string, tierLabel: string): string {
  return `${platformName} · ${tierLabel}`;
}

export async function fetchMpFeeTemplates(opts: ListOpts = {}) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeTemplates).getFullList<MpFeeTemplate>({
    sort: opts.sort ?? "sort_order,name",
    filter: opts.filter,
    expand: opts.expand ?? "channel,seller_tier",
    requestKey: null,
  });
}

export async function fetchMpFeeTemplate(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeTemplates).getOne<MpFeeTemplate>(id, {
    expand: "channel,seller_tier,store_channel_account",
    requestKey: null,
  });
}

export async function createMpFeeTemplate(data: Partial<MpFeeTemplate>) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeTemplates).create<MpFeeTemplate>(data);
}

export async function updateMpFeeTemplate(id: string, data: Partial<MpFeeTemplate>) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeTemplates).update<MpFeeTemplate>(id, data);
}

export async function deleteMpFeeTemplate(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeTemplates).delete(id);
}

export async function fetchMpFeeTemplateLines(templateId: string) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeTemplateLines).getFullList<MpFeeTemplateLine>({
    filter: `template = "${templateId}"`,
    sort: "sort_order,label",
    expand: "internal_category,scope_product",
    requestKey: null,
  });
}

export async function createMpFeeTemplateLine(data: Partial<MpFeeTemplateLine>) {
  const clean = cleanPbPayload(data);
  try {
    return await pb.collection(BISNIS_COLLECTIONS.mpFeeTemplateLines).create<MpFeeTemplateLine>(clean);
  } catch (e) {
    if (e instanceof ClientResponseError) {
      console.error("[createMpFeeTemplateLine]", e.status, e.response, clean);
      if (e.status === 400) {
        const retry = { ...clean };
        delete retry.is_active;
        delete retry.sort_order;
        delete retry.notes;
        try {
          return await pb.collection(BISNIS_COLLECTIONS.mpFeeTemplateLines).create<MpFeeTemplateLine>(retry);
        } catch {
          /* throw original below */
        }
      }
    }
    throw e;
  }
}

export async function updateMpFeeTemplateLine(id: string, data: Partial<MpFeeTemplateLine>) {
  const clean = cleanPbPayload(data);
  try {
    return await pb.collection(BISNIS_COLLECTIONS.mpFeeTemplateLines).update<MpFeeTemplateLine>(id, clean);
  } catch (e) {
    if (e instanceof ClientResponseError) {
      console.error("[updateMpFeeTemplateLine]", e.status, e.response, clean);
    }
    throw e;
  }
}

export async function deleteMpFeeTemplateLine(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeTemplateLines).delete(id);
}

export type MpFeeLineFormInput = {
  label: string;
  code?: string;
  line_group: MpFeeTemplateLine["line_group"];
  calc_type: MpFeeTemplateLine["calc_type"];
  rate?: number;
  max_amount?: number;
  fixed_amount?: number;
  applies_to: MpFeeTemplateLine["applies_to"];
  internal_category?: string;
  scope_product?: string;
  sort_order?: number;
  is_active?: boolean;
  notes?: string;
};

/** State form UI — angka disimpan sebagai teks agar format ID (4,5 · 40.000) mudah diketik. */
export type MpFeeLineFormState = {
  label: string;
  code: string;
  line_group: MpFeeTemplateLine["line_group"];
  calc_type: MpFeeTemplateLine["calc_type"];
  rateText: string;
  maxAmountText: string;
  fixedAmountText: string;
  applies_to: MpFeeTemplateLine["applies_to"];
  internal_category: string;
  sort_order: number;
  is_active: boolean;
};

export function mpFeeLineFormDefaults(
  partial?: Partial<
    MpFeeLineFormState & { rate?: number; max_amount?: number; fixed_amount?: number }
  >,
): MpFeeLineFormState {
  const rate = partial?.rate ?? 0;
  const max = partial?.max_amount ?? 0;
  const fixed = partial?.fixed_amount ?? 0;
  return {
    label: partial?.label ?? "",
    code: partial?.code ?? "",
    line_group: partial?.line_group ?? "mp_fee",
    calc_type: partial?.calc_type ?? "percent_cap",
    rateText:
      partial?.rateText ??
      (rate ? formatIdDecimal(rate) : ""),
    maxAmountText:
      partial?.maxAmountText ??
      (max ? formatIdInteger(max) : ""),
    fixedAmountText:
      partial?.fixedAmountText ??
      (fixed ? formatIdInteger(fixed) : ""),
    applies_to: partial?.applies_to ?? "order",
    internal_category: partial?.internal_category ?? "",
    sort_order: partial?.sort_order ?? 100,
    is_active: partial?.is_active !== false,
  };
}

export function mpFeeLineFormFromRecord(row: MpFeeTemplateLine): MpFeeLineFormState {
  return mpFeeLineFormDefaults({
    label: row.label,
    code: row.code,
    line_group: row.line_group,
    calc_type: row.calc_type,
    rate: row.rate,
    max_amount: row.max_amount,
    fixed_amount: row.fixed_amount,
    applies_to: row.applies_to,
    internal_category: row.internal_category ?? "",
    sort_order: row.sort_order ?? 100,
    is_active: row.is_active,
  });
}

export type ParsedLineFormResult =
  | { ok: true; data: MpFeeLineFormInput }
  | { ok: false; message: string };

export function parseMpFeeLineForm(form: MpFeeLineFormState): ParsedLineFormResult {
  if (!form.label.trim()) return { ok: false, message: "Nama biaya wajib diisi." };
  if (form.line_group === "category" && !form.internal_category) {
    return { ok: false, message: "Pilih kategori produk SERBA." };
  }

  const rate = form.rateText.trim() ? parseIdDecimal(form.rateText) : 0;
  const max_amount = form.maxAmountText.trim() ? parseIdInteger(form.maxAmountText) : 0;
  const fixed_amount = form.fixedAmountText.trim() ? parseIdInteger(form.fixedAmountText) : 0;

  if (form.calc_type.startsWith("percent")) {
    if (form.rateText.trim() && !Number.isFinite(rate)) {
      return { ok: false, message: "Rate (%) tidak valid. Contoh: 4,5 atau 10,2" };
    }
    if (form.calc_type === "percent_cap" && form.maxAmountText.trim() && !Number.isFinite(max_amount)) {
      return { ok: false, message: "Max (Rp) tidak valid. Contoh: 40.000" };
    }
  }
  if (
    (form.calc_type === "fixed" || form.calc_type === "fixed_per_qty") &&
    form.fixedAmountText.trim() &&
    !Number.isFinite(fixed_amount)
  ) {
    return { ok: false, message: "Nominal (Rp) tidak valid. Contoh: 1.250" };
  }

  return {
    ok: true,
    data: {
      label: form.label,
      code: form.code,
      line_group: form.line_group,
      calc_type: form.calc_type,
      rate,
      max_amount,
      fixed_amount,
      applies_to: form.applies_to,
      internal_category: form.internal_category,
      sort_order: form.sort_order,
      is_active: form.is_active,
    },
  };
}

function cleanPbPayload(data: Partial<MpFeeTemplateLine>): Partial<MpFeeTemplateLine> {
  const out: Partial<MpFeeTemplateLine> = {};
  for (const [key, val] of Object.entries(data) as [keyof MpFeeTemplateLine, unknown][]) {
    if (val === undefined || val === null) continue;
    if (typeof val === "number" && Number.isNaN(val)) continue;
    if (typeof val === "string" && val === "" && key !== "label" && key !== "code") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[key] = val;
  }
  return out;
}

/** Payload bersih — hanya field yang PocketBase terima, hindari NaN / field salah tipe. */
export function buildMpFeeLinePayload(
  templateId: string,
  form: MpFeeLineFormInput,
  opts?: { existingCodes?: string[] },
): Partial<MpFeeTemplateLine> {
  const label = form.label.trim();
  let code = (form.code ?? "").trim() || slugFromName(label);
  if (opts?.existingCodes?.includes(code)) {
    code = `${code}_${Date.now().toString(36).slice(-5)}`;
  }

  const payload: Partial<MpFeeTemplateLine> = {
    template: templateId,
    label,
    code,
    line_group: form.line_group,
    calc_type: form.calc_type,
    applies_to: form.applies_to,
    sort_order: form.sort_order ?? 100,
    is_active: form.is_active !== false,
  };

  if (form.notes?.trim()) payload.notes = form.notes.trim();

  if (form.line_group === "category" && form.internal_category) {
    payload.internal_category = form.internal_category;
  }

  if ((form.line_group === "product" || form.scope_product) && form.scope_product) {
    payload.line_group = "product";
    payload.scope_product = form.scope_product;
  }

  if (form.calc_type.startsWith("percent")) {
    payload.rate = Number.isFinite(form.rate) ? form.rate : 0;
    if (form.calc_type === "percent_cap" && form.max_amount != null && form.max_amount > 0) {
      payload.max_amount = form.max_amount;
    }
  } else if (Number.isFinite(form.fixed_amount) && (form.fixed_amount ?? 0) > 0) {
    payload.fixed_amount = form.fixed_amount;
  }

  return cleanPbPayload(payload);
}

/** Simpan / update fee per SKU produk dalam koleksi platform+tier. */
export async function upsertProductSkuFee(
  templateId: string,
  product: { id: string; sku: string; name: string },
  rate: number,
  existingLines: MpFeeTemplateLine[],
): Promise<MpFeeTemplateLine[]> {
  await applyProductSkuFee(templateId, product, rate, existingLines);
  return fetchMpFeeTemplateLines(templateId);
}

async function applyProductSkuFee(
  templateId: string,
  product: { id: string; sku: string; name: string },
  rate: number,
  existingLines: MpFeeTemplateLine[],
): Promise<void> {
  const existing = existingLines.find((l) => l.scope_product === product.id);

  if (!Number.isFinite(rate) || rate <= 0) {
    if (existing) await deleteMpFeeTemplateLine(existing.id);
    return;
  }

  const code = `sku_${slugFromName(product.sku)}`;
  const payload = buildMpFeeLinePayload(templateId, {
    label: product.name,
    code,
    line_group: "product",
    calc_type: "percent",
    rate,
    applies_to: "line",
    scope_product: product.id,
    sort_order: existing?.sort_order ?? 100,
    is_active: true,
  });

  if (existing) await updateMpFeeTemplateLine(existing.id, payload);
  else await createMpFeeTemplateLine(payload);
}

/** Simpan banyak fee SKU sekaligus ke satu koleksi (template). */
export async function bulkUpsertProductSkuFees(
  templateId: string,
  items: { product: { id: string; sku: string; name: string }; rate: number }[],
  existingLines: MpFeeTemplateLine[],
): Promise<MpFeeTemplateLine[]> {
  let lines = [...existingLines];
  for (const { product, rate } of items) {
    await applyProductSkuFee(templateId, product, rate, lines);
    if (Number.isFinite(rate) && rate > 0) {
      const code = `sku_${slugFromName(product.sku)}`;
      const idx = lines.findIndex((l) => l.scope_product === product.id);
      if (idx >= 0) {
        lines[idx] = { ...lines[idx], rate, line_group: "product" };
      } else {
        lines.push({
          id: `pending_${product.id}`,
          template: templateId,
          label: product.name,
          code,
          line_group: "product",
          calc_type: "percent",
          rate,
          applies_to: "line",
          scope_product: product.id,
          sort_order: 100,
          is_active: true,
          created: "",
          updated: "",
        });
      }
    } else {
      lines = lines.filter((l) => l.scope_product !== product.id);
    }
  }
  return fetchMpFeeTemplateLines(templateId);
}

export function isProductFeeLine(line: MpFeeTemplateLine): boolean {
  return line.line_group === "product" || !!line.scope_product;
}

export function isCategoryFeeLine(line: MpFeeTemplateLine): boolean {
  return line.line_group === "category" && !!line.internal_category && !line.scope_product;
}

export const SEED_SHOPEE_MALL_LINES: Omit<
  MpFeeTemplateLine,
  "id" | "template" | "created" | "updated"
>[] = [
  {
    label: "Fee Kategori",
    code: "category_fee",
    line_group: "category",
    calc_type: "percent",
    rate: 10.2,
    applies_to: "line",
    sort_order: 10,
    is_active: true,
  },
  {
    label: "Gratis Ongkir Extra",
    code: "free_shipping",
    line_group: "mp_fee",
    calc_type: "percent_cap",
    rate: 4,
    max_amount: 40000,
    applies_to: "order",
    sort_order: 20,
    is_active: true,
  },
  {
    label: "Promo Extra",
    code: "promo_extra",
    line_group: "mp_fee",
    calc_type: "percent_cap",
    rate: 4.5,
    max_amount: 60000,
    applies_to: "order",
    sort_order: 30,
    is_active: true,
  },
  {
    label: "Fee Mall",
    code: "mall_fee",
    line_group: "mp_fee",
    calc_type: "percent_cap",
    rate: 1.8,
    max_amount: 50000,
    applies_to: "order",
    sort_order: 40,
    is_active: true,
  },
  {
    label: "Asuransi Produk",
    code: "insurance",
    line_group: "mp_fee",
    calc_type: "percent",
    rate: 0.5,
    applies_to: "order",
    sort_order: 50,
    is_active: true,
  },
  {
    label: "Fee Voucher Extra",
    code: "voucher_extra",
    line_group: "mp_fee",
    calc_type: "percent",
    rate: 1,
    applies_to: "order",
    sort_order: 60,
    is_active: true,
  },
  {
    label: "Fee Affiliate",
    code: "affiliate",
    line_group: "mp_fee",
    calc_type: "percent",
    rate: 0,
    applies_to: "order",
    sort_order: 70,
    is_active: true,
  },
  {
    label: "PPn",
    code: "ppn",
    line_group: "mp_fee",
    calc_type: "percent",
    rate: 11,
    applies_to: "order",
    sort_order: 80,
    is_active: true,
  },
  {
    label: "Biaya Packing",
    code: "packing",
    line_group: "operational",
    calc_type: "fixed",
    fixed_amount: 5000,
    applies_to: "order",
    sort_order: 90,
    is_active: true,
  },
  {
    label: "Penanganan / Pemroses Pesanan",
    code: "processing",
    line_group: "operational",
    calc_type: "fixed",
    fixed_amount: 1250,
    applies_to: "order",
    sort_order: 100,
    is_active: true,
  },
];

/** Biaya standar MP tanpa fee kategori (kategori diatur terpisah). */
export const DEFAULT_MP_FEE_LINES = SEED_SHOPEE_MALL_LINES.filter((l) => l.line_group !== "category");

export async function ensureDefaultFeeLines(templateId: string): Promise<void> {
  const existing = await fetchMpFeeTemplateLines(templateId);
  if (existing.length > 0) return;
  for (const row of DEFAULT_MP_FEE_LINES) {
    await createMpFeeTemplateLine({ ...row, template: templateId });
  }
}

export async function getOrCreateTemplateForTier(
  channelId: string,
  sellerTierId: string,
  platformName: string,
  tierLabel: string,
): Promise<MpFeeTemplate> {
  const existing = await fetchMpFeeTemplates({
    filter: `channel = "${channelId}" && seller_tier = "${sellerTierId}"`,
  });
  if (existing[0]) return existing[0];

  const tpl = await createMpFeeTemplate({
    code: slugFromName(`${platformName}_${tierLabel}`),
    name: tierBundleLabel(platformName, tierLabel),
    channel: channelId,
    seller_tier: sellerTierId,
    is_active: true,
  });
  await ensureDefaultFeeLines(tpl.id);
  return tpl;
}

export async function seedShopeeMallTemplate(channelId?: string): Promise<MpFeeTemplate> {
  const tpl = await createMpFeeTemplate({
    code: "shopee_mall",
    name: "Shopee Mall",
    channel: channelId,
    sort_order: 1,
    is_active: true,
    notes: "Template contoh — sesuaikan rate & tambah baris per kategori produk SERBA",
  });
  for (const row of SEED_SHOPEE_MALL_LINES) {
    await createMpFeeTemplateLine({ ...row, template: tpl.id });
  }
  return tpl;
}
