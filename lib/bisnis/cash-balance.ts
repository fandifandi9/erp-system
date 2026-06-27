import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "./types";
import type { CashAccount, CashTransfer } from "./types";
import type { BillPayment, Payment } from "./client";
import type { Expense } from "./types";
import { expenseAffectsCash } from "./expense-posting";

export type CashAccountBalance = {
  accountId: string;
  opening: number;
  transferIn: number;
  transferOut: number;
  /** Uang masuk dari pelunasan invoice penjualan (dikurangi refund). */
  paymentIn: number;
  /** Uang keluar untuk pembayaran hutang pembelian. */
  paymentOut: number;
  /** Uang keluar untuk biaya operasional (paid/approved + cash_account). */
  expenseOut: number;
  balance: number;
};

/**
 * Saldo buku per akun kas = saldo awal + transfer masuk/keluar
 * + pembayaran penjualan (biz_payments.cash_account)
 * − pembayaran hutang (biz_bill_payments.cash_account)
 * − biaya operasional (biz_expenses.cash_account, status paid/approved).
 * Pembayaran tanpa akun kas tidak memengaruhi saldo.
 */
export async function computeCashAccountBalances(
  accounts: CashAccount[],
): Promise<Map<string, CashAccountBalance>> {
  const map = new Map<string, CashAccountBalance>();

  for (const a of accounts) {
    map.set(a.id, {
      accountId: a.id,
      opening: a.opening_balance ?? 0,
      transferIn: 0,
      transferOut: 0,
      paymentIn: 0,
      paymentOut: 0,
      expenseOut: 0,
      balance: a.opening_balance ?? 0,
    });
  }

  if (accounts.length === 0) return map;

  const [transfers, payments, billPayments, expenses] = await Promise.all([
    pb
      .collection(BISNIS_COLLECTIONS.cashTransfers)
      .getFullList<CashTransfer>({ requestKey: null })
      .catch(() => [] as CashTransfer[]),
    pb
      .collection(BISNIS_COLLECTIONS.payments)
      .getFullList<Payment>({ filter: 'cash_account != ""', requestKey: null })
      .catch(() => [] as Payment[]),
    pb
      .collection(BISNIS_COLLECTIONS.billPayments)
      .getFullList<BillPayment>({ filter: 'cash_account != ""', requestKey: null })
      .catch(() => [] as BillPayment[]),
    pb
      .collection(BISNIS_COLLECTIONS.expenses)
      .getFullList<Expense>({
        filter: 'cash_account != "" && status != "cancelled" && status != "draft"',
        requestKey: null,
      })
      .catch(() => [] as Expense[]),
  ]);

  for (const t of transfers) {
    const from = map.get(t.from_account);
    const to = map.get(t.to_account);
    if (from) {
      from.transferOut += t.amount;
      from.balance -= t.amount;
    }
    if (to) {
      to.transferIn += t.amount;
      to.balance += t.amount;
    }
  }

  for (const p of payments) {
    const acc = p.cash_account ? map.get(p.cash_account) : undefined;
    if (!acc) continue;
    // Fee pelunasan ikut masuk kas (Pendapatan Lain-lain).
    const amount = (Number(p.amount) || 0) + (Number(p.fee_amount) || 0);
    if (p.payment_kind === "refund") {
      acc.paymentIn -= amount;
      acc.balance -= amount;
    } else {
      acc.paymentIn += amount;
      acc.balance += amount;
    }
  }

  for (const bp of billPayments) {
    const acc = bp.cash_account ? map.get(bp.cash_account) : undefined;
    if (!acc) continue;
    const amount = Number(bp.amount) || 0;
    acc.paymentOut += amount;
    acc.balance -= amount;
  }

  for (const exp of expenses) {
    if (!expenseAffectsCash(exp.status, exp.cash_account)) continue;
    const acc = exp.cash_account ? map.get(exp.cash_account) : undefined;
    if (!acc) continue;
    const amount = Number(exp.total) || Number(exp.amount) || 0;
    acc.expenseOut += amount;
    acc.balance -= amount;
  }

  return map;
}
