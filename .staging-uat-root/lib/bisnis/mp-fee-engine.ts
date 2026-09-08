import type { MpFeeAppliesTo, MpFeeCalcType, MpFeeRule, MpFeeType } from "./types";

export type FeeContext = {
  channelId?: string;
  storeId?: string;
  storeChannelAccountId?: string;
  sellerTierId?: string;
  orderDate: string;
  mpCategory?: string;
  internalCategoryId?: string;
  productId?: string;
};

export type LineInput = {
  mpCategory?: string;
  internalCategoryId?: string;
  productId?: string;
  grossAmount: number;
  qty: number;
};

export type OrderFeeBreakdown = {
  category_fee: number;
  free_shipping: number;
  cashback: number;
  mall_fee: number;
  processing: number;
  affiliate: number;
  total: number;
  expected_net: number;
  line_category_fees: number[];
  line_allocated_order_fees: number[];
};

const ORDER_FEE_TYPES: MpFeeType[] = [
  "free_shipping",
  "cashback",
  "mall_fee",
  "processing",
  "affiliate",
];

function parseDateOnly(iso: string): Date {
  const d = iso.slice(0, 10);
  return new Date(`${d}T12:00:00`);
}

function ruleInPeriod(rule: MpFeeRule, orderDate: string): boolean {
  const d = parseDateOnly(orderDate);
  if (rule.valid_from && parseDateOnly(rule.valid_from) > d) return false;
  if (rule.valid_to && parseDateOnly(rule.valid_to) < d) return false;
  return true;
}

function ruleSpecificity(rule: MpFeeRule): number {
  let s = rule.priority ?? 0;
  if (rule.store_channel_account) s += 10000;
  else if (rule.store) s += 1000;
  if (rule.channel) s += 500;
  if (rule.seller_tier) s += 200;
  if (rule.scope_product) s += 100;
  if (rule.mp_category) s += 80;
  if (rule.internal_category) s += 60;
  return s;
}

function ruleMatches(rule: MpFeeRule, ctx: FeeContext, line?: LineInput): boolean {
  if (!rule.is_active) return false;
  if (!ruleInPeriod(rule, ctx.orderDate)) return false;
  if (rule.channel && rule.channel !== ctx.channelId) return false;
  if (rule.store && rule.store !== ctx.storeId) return false;
  if (rule.store_channel_account && rule.store_channel_account !== ctx.storeChannelAccountId) return false;
  if (rule.seller_tier && rule.seller_tier !== ctx.sellerTierId) return false;
  if (rule.scope_product && line && rule.scope_product !== line.productId) return false;
  // Kategori biaya dikunci dari master produk SERBA (via SKU) — abaikan label kategori MP di Excel.
  if (rule.mp_category) {
    if (line?.internalCategoryId) return false;
    if (line?.mpCategory) {
      if (rule.mp_category.toLowerCase() !== line.mpCategory.toLowerCase()) return false;
    } else {
      return false;
    }
  }
  if (rule.internal_category && line?.internalCategoryId) {
    if (rule.internal_category !== line.internalCategoryId) return false;
  } else if (rule.internal_category && !line?.internalCategoryId) {
    return false;
  }
  return true;
}

export function pickBestRule(
  rules: MpFeeRule[],
  feeType: MpFeeType,
  ctx: FeeContext,
  line?: LineInput,
): MpFeeRule | null {
  const candidates = rules
    .filter((r) => r.fee_type === feeType && ruleMatches(r, ctx, line))
    .sort((a, b) => ruleSpecificity(b) - ruleSpecificity(a));
  return candidates[0] ?? null;
}

export function calcFeeAmount(
  rule: MpFeeRule | null,
  baseAmount: number,
  qty = 1,
): number {
  if (!rule) return 0;
  const rate = rule.rate ?? 0;
  switch (rule.calc_type as MpFeeCalcType) {
    case "percent":
      return Math.round(baseAmount * (rate / 100));
    case "percent_cap": {
      const raw = Math.round(baseAmount * (rate / 100));
      const cap = rule.max_amount ?? Infinity;
      return Math.min(raw, cap);
    }
    case "fixed":
      return Math.round(rule.fixed_amount ?? 0);
    case "fixed_per_qty":
      return Math.round((rule.fixed_amount ?? 0) * qty);
    default:
      return 0;
  }
}

function allocateProportional(total: number, amounts: number[]): number[] {
  if (total <= 0 || amounts.length === 0) return amounts.map(() => 0);
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const each = Math.floor(total / amounts.length);
    const rem = total - each * amounts.length;
    return amounts.map((_, i) => each + (i < rem ? 1 : 0));
  }
  const allocated = amounts.map((a) => Math.floor((total * a) / sum));
  let diff = total - allocated.reduce((a, b) => a + b, 0);
  for (let i = 0; diff > 0 && i < allocated.length; i++) {
    allocated[i]++;
    diff--;
  }
  return allocated;
}

/** Hitung biaya MP untuk satu order (beberapa baris). */
export function calculateOrderFees(
  rules: MpFeeRule[],
  ctx: FeeContext,
  lines: LineInput[],
): OrderFeeBreakdown {
  const grossAmounts = lines.map((l) => l.grossAmount);
  const orderGross = grossAmounts.reduce((a, b) => a + b, 0);

  const lineCategoryFees = lines.map((line) => {
    const rule = pickBestRule(rules, "category_fee", ctx, line);
    return calcFeeAmount(rule, line.grossAmount, line.qty);
  });

  const orderFees: Record<string, number> = {};
  for (const feeType of ORDER_FEE_TYPES) {
    const rule = pickBestRule(rules, feeType, ctx);
    const qty = feeType === "processing" ? 1 : 1;
    orderFees[feeType] = calcFeeAmount(rule, orderGross, qty);
  }

  const totalOrderLevel =
    orderFees.free_shipping +
    orderFees.cashback +
    orderFees.mall_fee +
    orderFees.processing +
    orderFees.affiliate;

  const lineAllocated = allocateProportional(totalOrderLevel, grossAmounts);
  const categoryTotal = lineCategoryFees.reduce((a, b) => a + b, 0);
  const total = categoryTotal + totalOrderLevel;

  return {
    category_fee: categoryTotal,
    free_shipping: orderFees.free_shipping,
    cashback: orderFees.cashback,
    mall_fee: orderFees.mall_fee,
    processing: orderFees.processing,
    affiliate: orderFees.affiliate,
    total,
    expected_net: orderGross - total,
    line_category_fees: lineCategoryFees,
    line_allocated_order_fees: lineAllocated,
  };
}

export function feeAppliesToLabel(applies: MpFeeAppliesTo): string {
  return applies === "line" ? "Per baris" : "Per order";
}
