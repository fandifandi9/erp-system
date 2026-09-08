import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "./types";
import type { CashAccount, CashReconciliation, CashTransfer } from "./types";
import { postCashTransfer, type CashTransferInput } from "./cash-transfer";

export async function fetchCashAccounts(activeOnly = true, companyId?: string) {
  const parts: string[] = [];
  if (activeOnly) parts.push("is_active = true");
  if (companyId) parts.push(`company = "${companyId}"`);
  return pb.collection(BISNIS_COLLECTIONS.cashAccounts).getFullList<CashAccount>({
    filter: parts.length ? parts.join(" && ") : undefined,
    sort: "-is_primary,name",
    expand: "store,company",
    requestKey: null,
  });
}

export async function createCashAccount(data: Partial<CashAccount>) {
  return pb.collection(BISNIS_COLLECTIONS.cashAccounts).create<CashAccount>(data);
}

export async function updateCashAccount(id: string, data: Partial<CashAccount>) {
  return pb.collection(BISNIS_COLLECTIONS.cashAccounts).update<CashAccount>(id, data);
}

export async function deleteCashAccount(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.cashAccounts).delete(id);
}

export async function fetchCashTransfers(limit = 100, companyId?: string) {
  const filter = companyId
    ? `(from_company = "${companyId}" || to_company = "${companyId}" || initiated_company = "${companyId}")`
    : undefined;
  return pb.collection(BISNIS_COLLECTIONS.cashTransfers).getList<CashTransfer>(1, limit, {
    filter,
    sort: "-transfer_date,-created",
    expand: "from_account,to_account,from_company,to_company,created_by",
    requestKey: null,
  });
}

export async function createCashTransfer(data: CashTransferInput) {
  return postCashTransfer(data);
}

export async function fetchCashReconciliations(accountId?: string, limit = 50) {
  const filter = accountId ? `cash_account = "${accountId}"` : "";
  return pb.collection(BISNIS_COLLECTIONS.cashReconciliations).getList<CashReconciliation>(1, limit, {
    filter: filter || undefined,
    sort: "-statement_date,-created",
    expand: "cash_account,created_by",
    requestKey: null,
  });
}

export async function createCashReconciliation(data: Partial<CashReconciliation>) {
  return pb.collection(BISNIS_COLLECTIONS.cashReconciliations).create<CashReconciliation>(data);
}

export async function nextCashTransferNo() {
  const year = new Date().getFullYear();
  const prefix = `TRF-${year}-`;
  const latest = await pb.collection(BISNIS_COLLECTIONS.cashTransfers).getList<CashTransfer>(1, 1, {
    filter: `transfer_no ~ "${prefix}"`,
    sort: "-transfer_no",
    requestKey: null,
  });
  const last = latest.items[0]?.transfer_no;
  const seq = last ? parseInt(last.split("-").pop() ?? "0", 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, "0")}`;
}
