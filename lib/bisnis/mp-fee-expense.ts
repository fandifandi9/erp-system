import { pb } from "@/lib/pocketbase";
import { createExpense } from "./client";
import { BIZ_DOC_NUMBER_CONFIG, nextDocNo } from "./doc-number";
import { BISNIS_COLLECTIONS, type Expense } from "./types";

export type PostMpFeeExpenseInput = {
  feeAmount: number;
  expenseDate: string;
  platformLabel: string;
  mpOrderNo: string;
  invoiceNo: string;
  invoiceId: string;
  storeId?: string;
  createdBy: string;
};

/**
 * Catat potongan MP sebagai biaya operasional — bukan pengurangan omzet/diskon transaksi.
 */
export async function postMarketplaceFeeExpense(input: PostMpFeeExpenseInput): Promise<Expense | null> {
  const fee = Math.round(input.feeAmount);
  if (fee <= 0) return null;

  const expenseNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.exp, {
    periodDate: input.expenseDate,
  });

  let warehouse: string | undefined;
  if (input.storeId) {
    const store = await pb
      .collection(BISNIS_COLLECTIONS.stores)
      .getOne(input.storeId, { fields: "default_warehouse", requestKey: null })
      .catch(() => null);
    warehouse = (store as { default_warehouse?: string } | null)?.default_warehouse;
  }

  return createExpense({
    expense_no: expenseNo,
    category: "marketplace",
    description: `Biaya marketplace ${input.platformLabel} — ${input.mpOrderNo}`,
    amount: fee,
    tax_amount: 0,
    total: fee,
    expense_date: input.expenseDate.slice(0, 10),
    status: "approved",
    reference_no: input.invoiceNo,
    notes: JSON.stringify({
      source: "marketplace_import",
      invoice_id: input.invoiceId,
      mp_order_no: input.mpOrderNo,
      platform: input.platformLabel,
    }),
    store: input.storeId,
    warehouse,
    created_by: input.createdBy,
  });
}

export function parseMpFeesTotal(mpFeesJson?: string | null): number {
  if (!mpFeesJson?.trim()) return 0;
  try {
    const parsed = JSON.parse(mpFeesJson) as { total_fees?: number };
    return Math.max(0, Math.round(parsed.total_fees ?? 0));
  } catch {
    return 0;
  }
}
