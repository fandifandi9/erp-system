import type PocketBase from "pocketbase";
import { nextDocNoFor } from "@/lib/bisnis/doc-number";
import {
  legacyAmountsFromSettlement,
  parseSettlementEstimateJson,
  SETTLEMENT_INCOMING_LABELS,
  SETTLEMENT_OUTGOING_LABELS,
  sumSettlementByType,
  type SalesReturSettlementEstimate,
  type SettlementIncomingType,
  type SettlementOutgoingType,
} from "@/lib/bisnis/sales-retur-expected";
import type { Retur } from "@/lib/bisnis/types";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

export function hasPendingSettlementEstimate(retur: Pick<Retur, "settlement_estimate_json">): boolean {
  const est = parseSettlementEstimateJson(retur.settlement_estimate_json);
  return est.items.length > 0;
}

export function settlementTotals(estimate: SalesReturSettlementEstimate) {
  const legacy = legacyAmountsFromSettlement(estimate);
  const outgoingTotal = estimate.items
    .filter((i) => i.type in SETTLEMENT_OUTGOING_LABELS)
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const incomingTotal = estimate.items
    .filter((i) => i.type in SETTLEMENT_INCOMING_LABELS)
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return {
    ...legacy,
    mp_claim_amount: legacy.mp_claim_amount,
    shipping_reimb_amount: legacy.shipping_reimb_amount,
    outgoingTotal,
    incomingTotal,
    recovery_marketplace: sumSettlementByType(estimate, "recovery_marketplace"),
  };
}

async function postSettlementExpense(
  pb: PocketBase,
  input: {
    category: "transportasi" | "lainnya";
    description: string;
    amount: number;
    referenceNo: string;
    userId: string;
    companyId?: string;
    storeId?: string;
    warehouseId?: string;
  },
): Promise<string | null> {
  if (!input.amount || input.amount <= 0) return null;
  const expenseNo = await nextDocNoFor("exp");
  const row = await pb.collection(BISNIS_COLLECTIONS.expenses).create({
    expense_no: expenseNo,
    category: input.category,
    description: input.description,
    amount: input.amount,
    tax_amount: 0,
    total: input.amount,
    expense_date: new Date().toISOString().slice(0, 10),
    status: "approved",
    reference_no: input.referenceNo,
    created_by: input.userId,
    ...(input.companyId ? { company: input.companyId } : {}),
    ...(input.storeId ? { store: input.storeId } : {}),
    ...(input.warehouseId ? { warehouse: input.warehouseId } : {}),
  });
  return row.id;
}

const OUTGOING_EXPENSE_CATEGORY: Partial<Record<SettlementOutgoingType, "transportasi" | "lainnya">> = {
  seller_shipping: "transportasi",
  voucher: "lainnya",
  cashback: "lainnya",
  goodwill: "lainnya",
  other_expense: "lainnya",
};

/** Post beban settlement (selain refund/credit note yang ditangani accounting utama). */
export async function applySalesReturSettlementItems(
  pb: PocketBase,
  input: {
    retur: Retur;
    soId: string;
    orderNo?: string;
    userId: string;
    companyId?: string;
    storeId?: string;
    warehouseId?: string;
  },
): Promise<{ expenseIds: string[] }> {
  const estimate = parseSettlementEstimateJson(input.retur.settlement_estimate_json);
  const expenseIds: string[] = [];
  const ref = input.retur.retur_no;

  for (const item of estimate.items) {
    const amount = Math.max(0, Number(item.amount) || 0);
    if (amount <= 0) continue;

    if (item.type === "refund_customer") continue;
    if (item.type === "seller_shipping") continue;
    if (item.type in SETTLEMENT_INCOMING_LABELS) continue;

    const outgoing = item.type as SettlementOutgoingType;
    const category = OUTGOING_EXPENSE_CATEGORY[outgoing] ?? "lainnya";
    const label = SETTLEMENT_OUTGOING_LABELS[outgoing];
    const expId = await postSettlementExpense(pb, {
      category,
      description: `Retur ${ref}: ${label}${input.orderNo ? ` (SO ${input.orderNo})` : ""}`,
      amount,
      referenceNo: ref,
      userId: input.userId,
      companyId: input.companyId,
      storeId: input.storeId,
      warehouseId: input.warehouseId,
    });
    if (expId) expenseIds.push(expId);
  }

  return { expenseIds };
}

export function settlementSummaryLines(retur: Pick<Retur, "settlement_estimate_json">) {
  const est = parseSettlementEstimateJson(retur.settlement_estimate_json);
  return est.items.map((i) => {
    const label =
      i.type in SETTLEMENT_OUTGOING_LABELS
        ? SETTLEMENT_OUTGOING_LABELS[i.type as SettlementOutgoingType]
        : SETTLEMENT_INCOMING_LABELS[i.type as SettlementIncomingType];
    return { type: i.type, label, amount: i.amount };
  });
}
