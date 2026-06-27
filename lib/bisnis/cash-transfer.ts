import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "./types";
import type { CashAccount, CashTransfer, CashTransferKind } from "./types";

export type CashTransferInput = {
  from_account: string;
  to_account: string;
  amount: number;
  transfer_date: string;
  notes?: string;
  transfer_no: string;
  created_by: string;
  /** Entitas konteks kerja saat transfer dibuat. */
  initiated_company?: string;
};

async function getAccount(id: string): Promise<CashAccount> {
  return pb.collection(BISNIS_COLLECTIONS.cashAccounts).getOne<CashAccount>(id, {
    fields: "id,code,name,company,is_central,is_active",
    requestKey: null,
  });
}

/** Akun kas entitas aktif + semua akun kas pusat (lintas entitas). */
export async function fetchTransferEligibleAccounts(companyId?: string): Promise<CashAccount[]> {
  const parts: string[] = ["is_active = true"];
  if (companyId) {
    parts.push(`(company = "${companyId}" || is_central = true)`);
  }
  return pb.collection(BISNIS_COLLECTIONS.cashAccounts).getFullList<CashAccount>({
    filter: parts.join(" && "),
    sort: "name",
    expand: "company",
    requestKey: null,
  });
}

export async function validateCashTransferInput(
  input: Pick<CashTransferInput, "from_account" | "to_account" | "amount" | "initiated_company">,
): Promise<{
  transfer_kind: CashTransferKind;
  from_company?: string;
  to_company?: string;
  initiated_company?: string;
}> {
  if (input.from_account === input.to_account) {
    throw new Error("Akun asal dan tujuan harus berbeda");
  }
  if (!input.amount || input.amount <= 0) {
    throw new Error("Jumlah transfer harus lebih dari 0");
  }

  const [from, to] = await Promise.all([getAccount(input.from_account), getAccount(input.to_account)]);

  if (!from.is_active || !to.is_active) {
    throw new Error("Akun kas tidak aktif");
  }

  const fromCompany = from.company;
  const toCompany = to.company;

  if (!fromCompany || !toCompany) {
    throw new Error("Akun kas harus memiliki entitas pemilik");
  }

  const sameCompany = fromCompany === toCompany;
  const transfer_kind: CashTransferKind = sameCompany ? "internal" : "inter_company";

  if (!sameCompany) {
    const viaCentral = from.is_central || to.is_central;
    if (!viaCentral) {
      throw new Error(
        "Transfer antar entitas hanya boleh melalui akun kas pusat (tandai is_central di Kas & Bank)",
      );
    }
  }

  return {
    transfer_kind,
    from_company: fromCompany,
    to_company: toCompany,
    initiated_company: input.initiated_company || fromCompany,
  };
}

export async function postCashTransfer(input: CashTransferInput): Promise<CashTransfer> {
  const meta = await validateCashTransferInput(input);
  return pb.collection(BISNIS_COLLECTIONS.cashTransfers).create<CashTransfer>({
    ...input,
    ...meta,
  });
}
