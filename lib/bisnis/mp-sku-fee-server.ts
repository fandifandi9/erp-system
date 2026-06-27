import type PocketBase from "pocketbase";
import {
  BISNIS_COLLECTIONS,
  type MpProductFee,
  type MpSkuAffCalcType,
  type MpSkuCalcType,
  type MpTierDefault,
  type ProductTag,
} from "@/lib/bisnis/types";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ─── Spec & kalkulasi ───

export type SkuFeeSpec = {
  calc_type: MpSkuCalcType;
  rate?: number;
  max_amount?: number;
  fixed_amount?: number;
};

export type SkuFeeSource = "sku" | "tier_default" | "none";

export type ResolvedSkuFee = {
  product: string;
  mp: SkuFeeSpec | null;
  mp_source: SkuFeeSource;
  aff: SkuFeeSpec | null;
  aff_source: SkuFeeSource;
};

/**
 * Hitung potongan satu baris.
 * - percent     : gross × rate%
 * - percent_cap : min(gross × rate%, max_amount) — sesuai aturan "3% max Rp30.000"
 * - fixed       : fixed_amount × qty (potongan tetap per item)
 */
export function calcSkuFee(spec: SkuFeeSpec | null, gross: number, qty = 1): number {
  if (!spec || gross <= 0) return 0;
  switch (spec.calc_type) {
    case "percent":
      return Math.round(gross * ((spec.rate ?? 0) / 100));
    case "percent_cap": {
      const raw = Math.round(gross * ((spec.rate ?? 0) / 100));
      const cap = spec.max_amount && spec.max_amount > 0 ? spec.max_amount : Infinity;
      return Math.min(raw, cap);
    }
    case "fixed":
      return Math.round((spec.fixed_amount ?? 0) * Math.max(qty, 1));
    default:
      return 0;
  }
}

function specFromMp(row: {
  mp_calc_type?: string;
  mp_rate?: number;
  mp_max_amount?: number;
  mp_fixed_amount?: number;
}): SkuFeeSpec | null {
  if (!row.mp_calc_type) return null;
  return {
    calc_type: row.mp_calc_type as MpSkuCalcType,
    rate: row.mp_rate,
    max_amount: row.mp_max_amount,
    fixed_amount: row.mp_fixed_amount,
  };
}

function specFromAff(row: {
  aff_calc_type?: string;
  aff_rate?: number;
  aff_max_amount?: number;
  aff_fixed_amount?: number;
}): SkuFeeSpec | null {
  const t = row.aff_calc_type;
  if (!t || t === "none" || t === "inherit") return null;
  return {
    calc_type: t as MpSkuCalcType,
    rate: row.aff_rate,
    max_amount: row.aff_max_amount,
    fixed_amount: row.aff_fixed_amount,
  };
}

// ─── Resolver: SKU → default tier → 0 ───

/**
 * Resolve fee MP + affiliate untuk daftar produk pada satu tier.
 * Urutan: baris SKU aktif → default tier aktif → null (warning di pemanggil).
 */
export async function resolveSkuFees(
  pb: PocketBase,
  opts: { tierId: string; productIds: string[] },
): Promise<{ byProduct: Map<string, ResolvedSkuFee>; tierDefault: MpTierDefault | null }> {
  const ids = Array.from(new Set(opts.productIds.filter(Boolean)));
  const byProduct = new Map<string, ResolvedSkuFee>();
  if (!opts.tierId) {
    return { byProduct, tierDefault: null };
  }

  let tierDefault: MpTierDefault | null = null;
  const defaults = await pb
    .collection(BISNIS_COLLECTIONS.mpTierDefaults)
    .getFullList<MpTierDefault>({
      filter: `seller_tier = "${esc(opts.tierId)}" && is_active = true`,
      requestKey: null,
    })
    .catch(() => [] as MpTierDefault[]);
  tierDefault = defaults[0] ?? null;

  const rows: MpProductFee[] = [];
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const orFilter = chunk.map((id) => `product = "${esc(id)}"`).join(" || ");
    const res = await pb
      .collection(BISNIS_COLLECTIONS.mpProductFees)
      .getFullList<MpProductFee>({
        filter: `seller_tier = "${esc(opts.tierId)}" && is_active = true && (${orFilter})`,
        requestKey: null,
      })
      .catch(() => [] as MpProductFee[]);
    rows.push(...res);
  }
  const rowByProduct = new Map(rows.map((r) => [r.product, r]));

  const defaultMp = tierDefault ? specFromMp(tierDefault) : null;
  const defaultAff = tierDefault ? specFromAff(tierDefault) : null;

  for (const productId of ids) {
    const row = rowByProduct.get(productId);
    let mp: SkuFeeSpec | null = null;
    let mpSource: SkuFeeSource = "none";
    let aff: SkuFeeSpec | null = null;
    let affSource: SkuFeeSource = "none";

    if (row) {
      mp = specFromMp(row);
      mpSource = mp ? "sku" : "none";
      if (row.aff_calc_type === "inherit") {
        aff = defaultAff;
        affSource = aff ? "tier_default" : "none";
      } else {
        aff = specFromAff(row);
        affSource = aff ? "sku" : "none";
      }
    } else {
      mp = defaultMp;
      mpSource = mp ? "tier_default" : "none";
      aff = defaultAff;
      affSource = aff ? "tier_default" : "none";
    }

    byProduct.set(productId, { product: productId, mp, mp_source: mpSource, aff, aff_source: affSource });
  }

  return { byProduct, tierDefault };
}

export type SkuFeeLineInput = { product: string; gross: number; qty?: number };

export type SkuFeeLineResult = {
  product: string;
  gross: number;
  mp_fee: number;
  aff_fee: number;
  mp_source: SkuFeeSource;
  aff_source: SkuFeeSource;
  mp_spec: SkuFeeSpec | null;
  aff_spec: SkuFeeSpec | null;
  warning?: "no_rule";
};

/** Resolve + hitung sekaligus. Dipakai endpoint resolve & posting transaksi/import. */
export async function calculateSkuFees(
  pb: PocketBase,
  opts: { tierId: string; lines: SkuFeeLineInput[] },
): Promise<{
  lines: SkuFeeLineResult[];
  total_mp_fee: number;
  total_aff_fee: number;
  has_tier_default: boolean;
}> {
  const { byProduct, tierDefault } = await resolveSkuFees(pb, {
    tierId: opts.tierId,
    productIds: opts.lines.map((l) => l.product),
  });

  const lines: SkuFeeLineResult[] = opts.lines.map((line) => {
    const resolved = byProduct.get(line.product) ?? null;
    const mpSpec = resolved?.mp ?? null;
    const affSpec = resolved?.aff ?? null;
    const mpFee = calcSkuFee(mpSpec, line.gross, line.qty ?? 1);
    const affFee = calcSkuFee(affSpec, line.gross, line.qty ?? 1);
    return {
      product: line.product,
      gross: line.gross,
      mp_fee: mpFee,
      aff_fee: affFee,
      mp_source: resolved?.mp_source ?? "none",
      aff_source: resolved?.aff_source ?? "none",
      mp_spec: mpSpec,
      aff_spec: affSpec,
      ...(mpSpec ? {} : { warning: "no_rule" as const }),
    };
  });

  return {
    lines,
    total_mp_fee: lines.reduce((a, l) => a + l.mp_fee, 0),
    total_aff_fee: lines.reduce((a, l) => a + l.aff_fee, 0),
    has_tier_default: !!tierDefault,
  };
}

// ─── Validasi payload fee ───

const MP_CALC_TYPES: MpSkuCalcType[] = ["percent", "percent_cap", "fixed"];

export type FeeFieldsPayload = {
  mp_calc_type?: string;
  mp_rate?: number;
  mp_max_amount?: number;
  mp_fixed_amount?: number;
  aff_calc_type?: string;
  aff_rate?: number;
  aff_max_amount?: number;
  aff_fixed_amount?: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function normalizeFeeFields(
  payload: FeeFieldsPayload,
  opts: { allowInherit: boolean },
): Record<string, unknown> {
  const mpType = payload.mp_calc_type;
  if (!mpType || !MP_CALC_TYPES.includes(mpType as MpSkuCalcType)) {
    throw new Error("Tipe fee marketplace tidak valid.");
  }
  if (mpType === "percent_cap" && num(payload.mp_max_amount) <= 0) {
    throw new Error("Fee persen + maksimum wajib mengisi nilai maksimum (Rp).");
  }

  const affAllowed: string[] = ["none", ...MP_CALC_TYPES, ...(opts.allowInherit ? ["inherit"] : [])];
  const affType = payload.aff_calc_type ?? (opts.allowInherit ? "inherit" : "none");
  if (!affAllowed.includes(affType)) {
    throw new Error("Tipe fee affiliate tidak valid.");
  }
  if (affType === "percent_cap" && num(payload.aff_max_amount) <= 0) {
    throw new Error("Affiliate persen + maksimum wajib mengisi nilai maksimum (Rp).");
  }

  return {
    mp_calc_type: mpType,
    mp_rate: num(payload.mp_rate),
    mp_max_amount: num(payload.mp_max_amount),
    mp_fixed_amount: num(payload.mp_fixed_amount),
    aff_calc_type: affType as MpSkuAffCalcType,
    aff_rate: num(payload.aff_rate),
    aff_max_amount: num(payload.aff_max_amount),
    aff_fixed_amount: num(payload.aff_fixed_amount),
  };
}

async function tierChannel(pb: PocketBase, tierId: string): Promise<string> {
  const tier = await pb
    .collection(BISNIS_COLLECTIONS.mpSellerTiers)
    .getOne<{ channel?: string }>(tierId, { fields: "channel", requestKey: null });
  if (!tier.channel) throw new Error("Tier tidak punya channel.");
  return tier.channel;
}

// ─── Default tier ───

export async function listTierDefaults(
  pb: PocketBase,
  opts?: { channelId?: string; tierId?: string },
): Promise<MpTierDefault[]> {
  const parts: string[] = [];
  if (opts?.channelId) parts.push(`channel = "${esc(opts.channelId)}"`);
  if (opts?.tierId) parts.push(`seller_tier = "${esc(opts.tierId)}"`);
  return pb.collection(BISNIS_COLLECTIONS.mpTierDefaults).getFullList<MpTierDefault>({
    filter: parts.join(" && ") || undefined,
    sort: "created",
    expand: "channel,seller_tier",
    requestKey: null,
  });
}

export async function upsertTierDefault(
  pb: PocketBase,
  data: { seller_tier: string; notes?: string; is_active?: boolean } & FeeFieldsPayload,
): Promise<MpTierDefault> {
  if (!data.seller_tier?.trim()) throw new Error("Tier wajib dipilih.");
  const channel = await tierChannel(pb, data.seller_tier);
  const fields = normalizeFeeFields(data, { allowInherit: false });
  const record = {
    channel,
    seller_tier: data.seller_tier,
    ...fields,
    is_active: data.is_active !== false,
    notes: data.notes?.trim() || "",
  };

  const existing = await pb
    .collection(BISNIS_COLLECTIONS.mpTierDefaults)
    .getFirstListItem<MpTierDefault>(`seller_tier = "${esc(data.seller_tier)}"`, { requestKey: null })
    .catch(() => null);
  if (existing) {
    return pb.collection(BISNIS_COLLECTIONS.mpTierDefaults).update<MpTierDefault>(existing.id, record);
  }
  return pb.collection(BISNIS_COLLECTIONS.mpTierDefaults).create<MpTierDefault>(record);
}

export async function updateTierDefault(
  pb: PocketBase,
  id: string,
  data: Partial<{ notes: string; is_active: boolean }> & FeeFieldsPayload,
): Promise<MpTierDefault> {
  const patch: Record<string, unknown> = {};
  if (data.mp_calc_type !== undefined) {
    Object.assign(patch, normalizeFeeFields(data, { allowInherit: false }));
  }
  if (data.notes !== undefined) patch.notes = data.notes.trim();
  if (data.is_active !== undefined) patch.is_active = data.is_active;
  return pb.collection(BISNIS_COLLECTIONS.mpTierDefaults).update<MpTierDefault>(id, patch);
}

export async function deleteTierDefault(pb: PocketBase, id: string): Promise<void> {
  await pb.collection(BISNIS_COLLECTIONS.mpTierDefaults).delete(id);
}

// ─── Fee per SKU ───

export async function listProductFees(
  pb: PocketBase,
  opts: {
    channelId?: string;
    tierId?: string;
    q?: string;
    tagId?: string;
    page?: number;
    perPage?: number;
  },
): Promise<{ items: MpProductFee[]; totalItems: number; totalPages: number; page: number }> {
  const parts: string[] = [];
  if (opts.channelId) parts.push(`channel = "${esc(opts.channelId)}"`);
  if (opts.tierId) parts.push(`seller_tier = "${esc(opts.tierId)}"`);
  const q = opts.q?.trim();
  if (q) {
    const escQ = esc(q);
    parts.push(`(product.sku ~ "${escQ}" || product.name ~ "${escQ}")`);
  }

  // Filter tag: ambil anggota tag lalu saring di server app (tag bisa berisi ribuan SKU).
  let tagProducts: Set<string> | null = null;
  if (opts.tagId) {
    const tag = await pb
      .collection(BISNIS_COLLECTIONS.productTags)
      .getOne<ProductTag>(opts.tagId, { fields: "id,products", requestKey: null });
    tagProducts = new Set(tag.products ?? []);
    if (tagProducts.size === 0) {
      return { items: [], totalItems: 0, totalPages: 0, page: 1 };
    }
  }

  const page = opts.page ?? 1;
  const perPage = Math.min(opts.perPage ?? 50, 200);
  const filter = parts.join(" && ") || undefined;

  if (!tagProducts) {
    const res = await pb.collection(BISNIS_COLLECTIONS.mpProductFees).getList<MpProductFee>(page, perPage, {
      filter,
      sort: "-updated",
      expand: "channel,seller_tier,product",
      requestKey: null,
    });
    return { items: res.items, totalItems: res.totalItems, totalPages: res.totalPages, page: res.page };
  }

  const all = await pb.collection(BISNIS_COLLECTIONS.mpProductFees).getFullList<MpProductFee>({
    filter,
    sort: "-updated",
    expand: "channel,seller_tier,product",
    requestKey: null,
  });
  const filtered = all.filter((r) => tagProducts!.has(r.product));
  const totalItems = filtered.length;
  const totalPages = Math.max(Math.ceil(totalItems / perPage), 1);
  return { items: filtered.slice((page - 1) * perPage, page * perPage), totalItems, totalPages, page };
}

export async function upsertProductFee(
  pb: PocketBase,
  data: { seller_tier: string; product: string; notes?: string; is_active?: boolean } & FeeFieldsPayload,
): Promise<MpProductFee> {
  if (!data.seller_tier?.trim()) throw new Error("Tier wajib dipilih.");
  if (!data.product?.trim()) throw new Error("Produk wajib dipilih.");
  const channel = await tierChannel(pb, data.seller_tier);
  const fields = normalizeFeeFields(data, { allowInherit: true });
  const record = {
    channel,
    seller_tier: data.seller_tier,
    product: data.product,
    ...fields,
    is_active: data.is_active !== false,
    notes: data.notes?.trim() || "",
  };

  const existing = await pb
    .collection(BISNIS_COLLECTIONS.mpProductFees)
    .getFirstListItem<MpProductFee>(
      `seller_tier = "${esc(data.seller_tier)}" && product = "${esc(data.product)}"`,
      { requestKey: null },
    )
    .catch(() => null);
  if (existing) {
    return pb.collection(BISNIS_COLLECTIONS.mpProductFees).update<MpProductFee>(existing.id, record);
  }
  return pb.collection(BISNIS_COLLECTIONS.mpProductFees).create<MpProductFee>(record);
}

export async function updateProductFee(
  pb: PocketBase,
  id: string,
  data: Partial<{ notes: string; is_active: boolean }> & FeeFieldsPayload,
): Promise<MpProductFee> {
  const patch: Record<string, unknown> = {};
  if (data.mp_calc_type !== undefined) {
    Object.assign(patch, normalizeFeeFields(data, { allowInherit: true }));
  }
  if (data.notes !== undefined) patch.notes = data.notes.trim();
  if (data.is_active !== undefined) patch.is_active = data.is_active;
  return pb.collection(BISNIS_COLLECTIONS.mpProductFees).update<MpProductFee>(id, patch);
}

export async function deleteProductFee(pb: PocketBase, id: string): Promise<void> {
  await pb.collection(BISNIS_COLLECTIONS.mpProductFees).delete(id);
}

/**
 * Bulk update fee untuk banyak SKU sekaligus (per tag atau daftar produk).
 * Master mutable — transaksi lama aman karena snapshot di sales order.
 */
export async function bulkUpsertProductFees(
  pb: PocketBase,
  data: {
    seller_tier: string;
    product_ids?: string[];
    tag_id?: string;
  } & FeeFieldsPayload,
): Promise<{ updated: number; created: number; total: number }> {
  if (!data.seller_tier?.trim()) throw new Error("Tier wajib dipilih.");

  let productIds = (data.product_ids ?? []).filter(Boolean);
  if (data.tag_id) {
    const tag = await pb
      .collection(BISNIS_COLLECTIONS.productTags)
      .getOne<ProductTag>(data.tag_id, { fields: "id,products", requestKey: null });
    productIds = Array.from(new Set([...productIds, ...(tag.products ?? [])]));
  }
  if (productIds.length === 0) throw new Error("Tidak ada produk yang dipilih.");

  const channel = await tierChannel(pb, data.seller_tier);
  const fields = normalizeFeeFields(data, { allowInherit: true });

  const existingRows: MpProductFee[] = [];
  const CHUNK = 50;
  for (let i = 0; i < productIds.length; i += CHUNK) {
    const chunk = productIds.slice(i, i + CHUNK);
    const orFilter = chunk.map((id) => `product = "${esc(id)}"`).join(" || ");
    const res = await pb.collection(BISNIS_COLLECTIONS.mpProductFees).getFullList<MpProductFee>({
      filter: `seller_tier = "${esc(data.seller_tier)}" && (${orFilter})`,
      fields: "id,product",
      requestKey: null,
    });
    existingRows.push(...res);
  }
  const existingByProduct = new Map(existingRows.map((r) => [r.product, r.id]));

  let updated = 0;
  let created = 0;
  for (const productId of productIds) {
    const existingId = existingByProduct.get(productId);
    if (existingId) {
      await pb
        .collection(BISNIS_COLLECTIONS.mpProductFees)
        .update(existingId, { ...fields, is_active: true }, { requestKey: null });
      updated += 1;
    } else {
      await pb.collection(BISNIS_COLLECTIONS.mpProductFees).create(
        {
          channel,
          seller_tier: data.seller_tier,
          product: productId,
          ...fields,
          is_active: true,
        },
        { requestKey: null },
      );
      created += 1;
    }
  }

  return { updated, created, total: productIds.length };
}

// ─── Tag produk (alat bantu, bukan input hitung) ───

export async function listProductTags(pb: PocketBase, q?: string): Promise<ProductTag[]> {
  const filter = q?.trim() ? `name ~ "${esc(q.trim())}"` : undefined;
  return pb.collection(BISNIS_COLLECTIONS.productTags).getFullList<ProductTag>({
    filter,
    sort: "name",
    requestKey: null,
  });
}

export async function createProductTag(
  pb: PocketBase,
  data: { name: string; products?: string[]; notes?: string },
): Promise<ProductTag> {
  if (!data.name?.trim()) throw new Error("Nama tag wajib diisi.");
  return pb.collection(BISNIS_COLLECTIONS.productTags).create<ProductTag>({
    name: data.name.trim(),
    products: data.products ?? [],
    notes: data.notes?.trim() || "",
    is_active: true,
  });
}

export async function updateProductTag(
  pb: PocketBase,
  id: string,
  data: Partial<{
    name: string;
    notes: string;
    is_active: boolean;
    products: string[];
    add_products: string[];
    remove_products: string[];
  }>,
): Promise<ProductTag> {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) {
    if (!data.name.trim()) throw new Error("Nama tag wajib diisi.");
    patch.name = data.name.trim();
  }
  if (data.notes !== undefined) patch.notes = data.notes.trim();
  if (data.is_active !== undefined) patch.is_active = data.is_active;
  if (data.products !== undefined) patch.products = data.products;
  // PocketBase relation append/remove modifiers
  if (data.add_products?.length) patch["products+"] = data.add_products;
  if (data.remove_products?.length) patch["products-"] = data.remove_products;
  return pb.collection(BISNIS_COLLECTIONS.productTags).update<ProductTag>(id, patch);
}

export async function deleteProductTag(pb: PocketBase, id: string): Promise<void> {
  await pb.collection(BISNIS_COLLECTIONS.productTags).delete(id);
}
