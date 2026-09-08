/**
 * Phase 34F/34G — immutable bank account snapshot on payroll_items (period-aware).
 */

import type PocketBase from "pocketbase";
import { getPayrollBankAccountForUserAsOf } from "@/lib/hr/payroll-bank-account-server";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function resolvePayrollAsOfDate(
  adminPb: PocketBase,
  item: Record<string, unknown>,
): Promise<string> {
  const periodId = String(item.period ?? "").trim();
  if (periodId) {
    try {
      const period = (await adminPb.collection("payroll_periods").getOne(periodId, {
        fields: "pay_date,end_date,start_date",
        requestKey: null,
      })) as Record<string, unknown>;
      const payDate = String(period.pay_date ?? "").slice(0, 10);
      if (payDate) return payDate;
      const endDate = String(period.end_date ?? "").slice(0, 10);
      if (endDate) return endDate;
    } catch {
      /* fallback */
    }
  }
  return new Date().toISOString().slice(0, 10);
}

export async function stampPayrollItemBankSnapshot(
  adminPb: PocketBase,
  payrollItemId: string,
  userId: string,
  force = false,
): Promise<void> {
  const item = (await adminPb.collection("payroll_items").getOne(payrollItemId, {
    requestKey: null,
  })) as Record<string, unknown>;

  if (!force && String(item.bank_name_snapshot ?? "").trim()) {
    return;
  }

  const asOf = await resolvePayrollAsOfDate(adminPb, item);
  const account = await getPayrollBankAccountForUserAsOf(adminPb, userId, asOf);
  if (!account) {
    return;
  }

  await adminPb.collection("payroll_items").update(
    payrollItemId,
    {
      bank_account_id_snapshot: account.id,
      bank_name_snapshot: account.bank_name,
      bank_account_number_snapshot: account.account_number,
      bank_account_holder_snapshot: account.account_holder_name,
    },
    { requestKey: null },
  );
}

export async function stampAllPayrollItemBankSnapshotsInPeriod(
  adminPb: PocketBase,
  periodId: string,
  force = false,
): Promise<number> {
  const items = await adminPb.collection("payroll_items").getFullList<{ id: string; user: string }>({
    filter: `period = "${pbEscape(periodId)}"`,
    fields: "id,user",
    requestKey: null,
  });
  for (const item of items) {
    await stampPayrollItemBankSnapshot(adminPb, item.id, item.user, force);
  }
  return items.length;
}
