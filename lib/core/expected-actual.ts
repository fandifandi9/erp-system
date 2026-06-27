/**
 * Pola Expected vs Actual — dipakai lintas ERP (retur penjualan, penerimaan/QC pembelian, dll.).
 * Expected == Actual → caller boleh auto-proceed tanpa approval bisnis.
 */

import type { PurchaseOrderLine } from "@/lib/bisnis/types";
import {
  parseReceivingWorkflow,
  type ReceivingWorkflow,
} from "@/lib/wms/receiving-workflow";

/** Kondisi fisik akhir stok — hanya dua kemungkinan. */
export type SellableCondition = "sellable" | "unsellable";

export type ExceptionType =
  | "none"
  | "qty"
  | "condition"
  | "sku"
  | "completeness"
  | "mixed";

export type ExceptionStatus = "none" | "open" | "resolved";

export type ExpectedActualMatch<TDetail = unknown> =
  | { match: true; detail?: TDetail }
  | { match: false; exceptionType: ExceptionType; reasons: string[]; detail?: TDetail };

export type PurchaseQcStockLine = { product: string; qty: number };

export type PurchaseQcAnalysis = {
  match: boolean;
  hasDiscrepancy: boolean;
  exceptionType: ExceptionType;
  reasons: string[];
  stockLines: PurchaseQcStockLine[];
};

function lineLabel(line: PurchaseOrderLine): string {
  return line.expand?.product?.name ?? line.product;
}

/**
 * Bandingkan expected PO (semua qty layak dijual) vs actual QC WMS.
 * Match = semua baris qc_ok dan tidak ada qty rusak.
 */
export function analyzePurchaseQcWorkflow(
  lines: PurchaseOrderLine[],
  wfInput?: ReceivingWorkflow | string | null,
): PurchaseQcAnalysis {
  const wf =
    typeof wfInput === "string" || wfInput === null || wfInput === undefined
      ? parseReceivingWorkflow(wfInput)
      : wfInput;

  const stockLines: PurchaseQcStockLine[] = [];
  const reasons: string[] = [];
  let hasConditionIssue = false;
  let hasQtyIssue = false;

  for (const line of lines) {
    const st = wf.lines[line.id];
    const ordered = Number(line.qty) || 0;
    if (ordered <= 0) continue;

    const name = lineLabel(line);
    const damaged = Math.min(Math.max(0, Number(st?.damaged_qty) || 0), ordered);
    const passQty = ordered - damaged;

    if (damaged > 0) {
      hasConditionIssue = true;
      reasons.push(`"${name}": ${damaged} pcs tidak layak dijual baru (rusak/cacat).`);
    }
    if (!st?.qc_ok) {
      hasQtyIssue = true;
      reasons.push(`QC belum lulus untuk "${name}".`);
    }

    if (passQty > 0) stockLines.push({ product: line.product, qty: passQty });
    if (damaged > 0) stockLines.push({ product: line.product, qty: damaged });
  }

  const hasDiscrepancy = hasConditionIssue || hasQtyIssue;
  let exceptionType: ExceptionType = "none";
  if (hasConditionIssue && hasQtyIssue) exceptionType = "mixed";
  else if (hasConditionIssue) exceptionType = "condition";
  else if (hasQtyIssue) exceptionType = "qty";

  return {
    match: !hasDiscrepancy,
    hasDiscrepancy,
    exceptionType,
    reasons,
    stockLines,
  };
}

/** Map kondisi retur legacy → sellable / unsellable. */
export function returConditionToSellable(
  condition?: string | null,
): SellableCondition {
  return condition === "damaged" ? "unsellable" : "sellable";
}

export function sellableToReturCondition(c: SellableCondition): "good" | "damaged" {
  return c === "unsellable" ? "damaged" : "good";
}

export type SalesReturWmsActualLine = {
  lineId: string;
  actualQty: number;
  actualCondition: "good" | "damaged";
};

export type SalesReturWmsAnalysis = {
  match: boolean;
  hasDiscrepancy: boolean;
  exceptionType: ExceptionType;
  reasons: string[];
};

function returLineLabel(line: {
  product: string;
  expand?: { product?: { name?: string } };
}): string {
  return line.expand?.product?.name ?? line.product;
}

/**
 * Bandingkan estimasi bisnis (qty + kondisi) vs fakta WMS per baris retur.
 */
export function analyzeSalesReturWmsReceive(
  lines: Array<{
    id: string;
    product: string;
    qty: number;
    expected_condition?: string | null;
    condition?: string | null;
    expand?: { product?: { name?: string } };
  }>,
  actuals: SalesReturWmsActualLine[],
): SalesReturWmsAnalysis {
  const actualByLine = new Map(actuals.map((a) => [a.lineId, a]));
  const reasons: string[] = [];
  let hasQtyIssue = false;
  let hasConditionIssue = false;

  for (const line of lines) {
    const expectedQty = Number(line.qty) || 0;
    if (expectedQty <= 0) continue;

    const expectedCondition =
      line.expected_condition === "damaged" || line.condition === "damaged" ? "damaged" : "good";
    const actual = actualByLine.get(line.id);
    const actualQty = actual ? Math.max(0, Number(actual.actualQty) || 0) : expectedQty;
    const actualCondition = actual?.actualCondition === "damaged" ? "damaged" : "good";
    const name = returLineLabel(line);

    if (actualQty !== expectedQty) {
      hasQtyIssue = true;
      reasons.push(
        `"${name}": qty diterima ${actualQty}, estimasi ${expectedQty}.`,
      );
    }
    if (actualCondition !== expectedCondition) {
      hasConditionIssue = true;
      const expLabel =
        expectedCondition === "damaged" ? "tidak layak dijual" : "layak dijual";
      const actLabel =
        actualCondition === "damaged" ? "tidak layak dijual" : "layak dijual";
      reasons.push(`"${name}": kondisi fisik ${actLabel}, estimasi ${expLabel}.`);
    }
  }

  const hasDiscrepancy = hasQtyIssue || hasConditionIssue;
  let exceptionType: ExceptionType = "none";
  if (hasConditionIssue && hasQtyIssue) exceptionType = "mixed";
  else if (hasConditionIssue) exceptionType = "condition";
  else if (hasQtyIssue) exceptionType = "qty";

  return {
    match: !hasDiscrepancy,
    hasDiscrepancy,
    exceptionType,
    reasons,
  };
}
