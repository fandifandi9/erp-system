import type { MpFeeCalcType, MpFeeTemplateLine, MpTemplateLineGroup } from "./types";
import type { LineInput } from "./mp-fee-engine";

export type TemplateFeeItem = {
  code: string;
  label: string;
  group: MpTemplateLineGroup;
  rate?: number;
  max_amount?: number;
  amount: number;
  applies_to: "line" | "order";
};

export type TemplateOrderResult = {
  items: TemplateFeeItem[];
  lineCategoryFees: number[];
  lineAllocatedOrderFees: number[];
  totalFees: number;
  expected_net: number;
  mpFeeSubtotal: number;
  operationalSubtotal: number;
  legacy: {
    fee_category: number;
    fee_free_shipping: number;
    fee_cashback: number;
    fee_mall: number;
    fee_processing: number;
    fee_affiliate: number;
  };
};

function calcTemplateLineAmount(
  line: MpFeeTemplateLine,
  baseAmount: number,
  qty: number,
): number {
  const rate = line.rate ?? 0;
  switch (line.calc_type as MpFeeCalcType) {
    case "percent":
      return Math.round(baseAmount * (rate / 100));
    case "percent_cap": {
      const raw = Math.round(baseAmount * (rate / 100));
      const cap = line.max_amount ?? Infinity;
      return Math.min(raw, cap);
    }
    case "fixed":
      return Math.round(line.fixed_amount ?? 0);
    case "fixed_per_qty":
      return Math.round((line.fixed_amount ?? 0) * qty);
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

function lineMatchesFeeRow(tpl: MpFeeTemplateLine, line: LineInput): boolean {
  if (tpl.scope_product || tpl.line_group === "product") {
    if (tpl.scope_product) {
      return !!line.productId && line.productId === tpl.scope_product;
    }
    return true;
  }
  if (tpl.internal_category || tpl.line_group === "category") {
    return line.internalCategoryId === tpl.internal_category;
  }
  return true;
}

function isPerLineSkuFee(tpl: MpFeeTemplateLine): boolean {
  return tpl.line_group === "product" || !!tpl.scope_product;
}

function isPerLineCategoryFee(tpl: MpFeeTemplateLine): boolean {
  return (tpl.line_group === "category" || !!tpl.internal_category) && !tpl.scope_product;
}

function pushItem(
  items: TemplateFeeItem[],
  tpl: MpFeeTemplateLine,
  amount: number,
) {
  if (amount <= 0) return;
  const existing = items.find((i) => i.code === tpl.code && i.label === tpl.label);
  if (existing) {
    existing.amount += amount;
    return;
  }
  items.push({
    code: tpl.code,
    label: tpl.label,
    group: tpl.line_group,
    rate: tpl.rate,
    max_amount: tpl.max_amount,
    amount,
    applies_to: tpl.applies_to,
  });
}

/** Kalkulasi satu order dari baris template (mirip sheet Kalkulasi Profit). */
export function calculateTemplateOrderFees(
  templateLines: MpFeeTemplateLine[],
  lines: LineInput[],
): TemplateOrderResult {
  const active = templateLines
    .filter((l) => l.is_active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const grossAmounts = lines.map((l) => l.grossAmount);
  const orderGross = grossAmounts.reduce((a, b) => a + b, 0);
  const lineCategoryFees = lines.map(() => 0);
  const items: TemplateFeeItem[] = [];
  let orderMpFeeTotal = 0;
  let orderOperationalTotal = 0;

  for (const tpl of active) {
    const perLineSku = isPerLineSkuFee(tpl);
    const perLineCat = isPerLineCategoryFee(tpl);

    if (perLineSku && tpl.applies_to === "line") {
      lines.forEach((line, idx) => {
        if (!lineMatchesFeeRow(tpl, line)) return;
        const amt = calcTemplateLineAmount(tpl, line.grossAmount, line.qty);
        lineCategoryFees[idx] += amt;
        pushItem(items, tpl, amt);
      });
      continue;
    }

    if (perLineCat && tpl.applies_to === "line") {
      lines.forEach((line, idx) => {
        const hasSkuFee = active.some(
          (t) => isPerLineSkuFee(t) && lineMatchesFeeRow(t, line),
        );
        if (hasSkuFee) return;
        if (!lineMatchesFeeRow(tpl, line)) return;
        const amt = calcTemplateLineAmount(tpl, line.grossAmount, line.qty);
        lineCategoryFees[idx] += amt;
        pushItem(items, tpl, amt);
      });
      continue;
    }

    if (tpl.applies_to === "line") {
      lines.forEach((line) => {
        if (!lineMatchesFeeRow(tpl, line)) return;
        const amt = calcTemplateLineAmount(tpl, line.grossAmount, line.qty);
        pushItem(items, tpl, amt);
        if (tpl.line_group === "operational") orderOperationalTotal += amt;
        else orderMpFeeTotal += amt;
      });
      continue;
    }

    const amt = calcTemplateLineAmount(tpl, orderGross, 1);
    pushItem(items, tpl, amt);
    if (tpl.line_group === "operational") orderOperationalTotal += amt;
    else orderMpFeeTotal += amt;
  }

  const lineAllocated = allocateProportional(orderMpFeeTotal, grossAmounts);
  const categoryTotal = lineCategoryFees.reduce((a, b) => a + b, 0);
  const totalFees = categoryTotal + orderMpFeeTotal + orderOperationalTotal;

  const legacy = mapItemsToLegacy(items, categoryTotal, orderMpFeeTotal, orderOperationalTotal);

  return {
    items,
    lineCategoryFees,
    lineAllocatedOrderFees: lineAllocated,
    totalFees,
    expected_net: orderGross - totalFees,
    mpFeeSubtotal: categoryTotal + orderMpFeeTotal,
    operationalSubtotal: orderOperationalTotal,
    legacy,
  };
}

function mapItemsToLegacy(
  items: TemplateFeeItem[],
  categoryTotal: number,
  orderMpTotal: number,
  operationalTotal: number,
): TemplateOrderResult["legacy"] {
  const legacy = {
    fee_category: categoryTotal,
    fee_free_shipping: 0,
    fee_cashback: 0,
    fee_mall: 0,
    fee_processing: 0,
    fee_affiliate: 0,
  };

  for (const it of items) {
    const c = it.code.toLowerCase();
    if (c === "category_fee" || c === "fee_kategori" || it.group === "category") continue;
    if (c.includes("ongkir") || c === "free_shipping") legacy.fee_free_shipping += it.amount;
    else if (c.includes("cashback") || c === "cashback") legacy.fee_cashback += it.amount;
    else if (c.includes("mall")) legacy.fee_mall += it.amount;
    else if (c.includes("affiliate")) legacy.fee_affiliate += it.amount;
    else if (c.includes("proses") || c === "processing" || it.group === "operational")
      legacy.fee_processing += it.amount;
    else if (orderMpTotal > 0 && it.applies_to === "order") {
      legacy.fee_mall += it.amount;
    }
  }

  legacy.fee_processing += operationalTotal;
  return legacy;
}

/** Simulator: satu harga jual (satu baris order). */
export function simulateTemplateFees(
  templateLines: MpFeeTemplateLine[],
  salePrice: number,
  qty = 1,
  internalCategoryId?: string,
  productId?: string,
): TemplateOrderResult {
  return calculateTemplateOrderFees(templateLines, [
    {
      grossAmount: Math.round(salePrice * qty),
      qty,
      internalCategoryId,
      productId,
    },
  ]);
}

export type RecommendPriceTarget =
  | { mode: "percent"; profitPctOnCost: number }
  | { mode: "nominal"; profitAmount: number };

export type RecommendPriceResult = {
  recommendedUnitPrice: number;
  recommendedGross: number;
  totalFees: number;
  expectedNet: number;
  profitAmount: number;
  profitPctOnCost: number;
  simulation: TemplateOrderResult;
};

function effectiveTemplateLines(
  templateLines: MpFeeTemplateLine[],
  opts: { productId?: string; manualProductFeeRate?: number },
): MpFeeTemplateLine[] {
  const active = templateLines.filter((l) => l.is_active);

  if (opts.productId) {
    return active;
  }

  const withoutSku = active.filter((l) => l.line_group !== "product" && !l.scope_product);
  const rate = opts.manualProductFeeRate;
  if (!rate || rate <= 0 || !Number.isFinite(rate)) {
    return withoutSku;
  }

  return [
    ...withoutSku,
    {
      id: "__manual_product_fee__",
      template: "",
      label: "Fee produk (manual)",
      code: "manual_product_fee",
      line_group: "product",
      calc_type: "percent",
      rate,
      applies_to: "line",
      sort_order: 5,
      is_active: true,
      created: "",
      updated: "",
    },
  ];
}

/**
 * Rekomendasi harga jual satuan: modal + target untung → harga jual minimum
 * agar saldo net setelah semua biaya template tercapai.
 */
export function recommendSellingPrice(
  templateLines: MpFeeTemplateLine[],
  costPerUnit: number,
  target: RecommendPriceTarget,
  productId?: string,
  internalCategoryId?: string,
  manualProductFeeRate?: number,
): RecommendPriceResult | null {
  if (!Number.isFinite(costPerUnit) || costPerUnit <= 0) return null;

  const lines = effectiveTemplateLines(templateLines, { productId, manualProductFeeRate });
  if (lines.length === 0) return null;

  const qty = 1;
  const totalCost = costPerUnit;

  let targetNet: number;
  if (target.mode === "percent") {
    if (!Number.isFinite(target.profitPctOnCost) || target.profitPctOnCost < 0) return null;
    targetNet = Math.round(totalCost * (1 + target.profitPctOnCost / 100));
  } else {
    if (!Number.isFinite(target.profitAmount) || target.profitAmount < 0) return null;
    targetNet = Math.round(totalCost + target.profitAmount);
  }

  let lo = Math.ceil(costPerUnit);
  let hi = Math.max(lo, Math.ceil(costPerUnit * 3 + 500_000));

  for (let i = 0; i < 8; i++) {
    const sim = simulateTemplateFees(lines, hi, qty, internalCategoryId, productId);
    if (sim.expected_net >= targetNet) break;
    hi *= 2;
  }

  const simAtHi = simulateTemplateFees(lines, hi, qty, internalCategoryId, productId);
  if (simAtHi.expected_net < targetNet) return null;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const sim = simulateTemplateFees(lines, mid, qty, internalCategoryId, productId);
    if (sim.expected_net < targetNet) lo = mid + 1;
    else hi = mid;
  }

  const simulation = simulateTemplateFees(lines, lo, qty, internalCategoryId, productId);
  const profitAmount = simulation.expected_net - totalCost;
  const profitPctOnCost = totalCost > 0 ? (profitAmount / totalCost) * 100 : 0;

  return {
    recommendedUnitPrice: lo,
    recommendedGross: lo,
    totalFees: simulation.totalFees,
    expectedNet: simulation.expected_net,
    profitAmount,
    profitPctOnCost,
    simulation,
  };
}
