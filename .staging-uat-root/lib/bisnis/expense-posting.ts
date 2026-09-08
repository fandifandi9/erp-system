import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type Expense, type ExpenseStatus } from "./types";
import {
  assertCashAccountBelongsToCompany,
  assertWarehouseBelongsToCompany,
  fetchStoreCompany,
  resolveCompanyForExpense,
} from "./entity-resolve";

const CASH_OUT_STATUSES: ExpenseStatus[] = ["paid", "approved"];

/** Status biaya yang mengurangi saldo kas (jika cash_account diisi). */
export function expenseAffectsCash(status?: ExpenseStatus, cashAccountId?: string | null): boolean {
  return !!cashAccountId && !!status && CASH_OUT_STATUSES.includes(status);
}

/** Normalisasi & validasi payload biaya sebelum create/update. */
export async function prepareExpensePayload(
  data: Partial<Expense>,
  opts?: { isUpdate?: boolean; prev?: Pick<Expense, "status" | "cash_account" | "total"> },
): Promise<Partial<Expense>> {
  let payload = { ...data };

  if (payload.store && !payload.warehouse) {
    const store = await pb
      .collection(BISNIS_COLLECTIONS.stores)
      .getOne(payload.store, { fields: "default_warehouse,company", requestKey: null })
      .catch(() => null);
    if (store) {
      const st = store as { default_warehouse?: string; company?: string };
      if (st.default_warehouse) payload.warehouse = st.default_warehouse;
      if (!payload.company && st.company) payload.company = st.company;
    }
  }

  const company = await resolveCompanyForExpense(payload);
  if (!payload.store && (payload.status === "paid" || payload.status === "approved")) {
    throw new Error("Toko wajib dipilih untuk biaya operasional");
  }

  if (payload.status === "paid" && !payload.cash_account?.trim()) {
    throw new Error("Akun kas/bank wajib dipilih untuk biaya yang sudah dibayar");
  }

  if (company) {
    payload = { ...payload, company };
    if (payload.warehouse) {
      await assertWarehouseBelongsToCompany(payload.warehouse, company);
    }
    if (payload.cash_account && expenseAffectsCash(payload.status, payload.cash_account)) {
      await assertCashAccountBelongsToCompany(payload.cash_account, company);
    }
    if (payload.store) {
      const storeCompany = await fetchStoreCompany(payload.store);
      if (storeCompany && storeCompany !== company) {
        throw new Error("Toko tidak milik entitas yang sama");
      }
    }
  }

  if (opts?.isUpdate && opts.prev) {
    const wasCash = expenseAffectsCash(opts.prev.status, opts.prev.cash_account);
    const willCash = expenseAffectsCash(payload.status ?? opts.prev.status, payload.cash_account ?? opts.prev.cash_account);
    if (willCash && !payload.cash_account && !opts.prev.cash_account) {
      throw new Error("Akun kas/bank wajib untuk mencatat pengeluaran kas");
    }
    if (!wasCash && willCash && company && (payload.cash_account || opts.prev.cash_account)) {
      await assertCashAccountBelongsToCompany(
        (payload.cash_account || opts.prev.cash_account)!,
        company,
      );
    }
  }

  return payload;
}
