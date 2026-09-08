/** Mask bank account for UI — last 4 digits visible (Phase 34G). */
export function maskBankAccountNumber(accountNumber: string): string {
  const digits = String(accountNumber ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length <= 4) return `•••• ${digits}`;
  const last4 = digits.slice(-4);
  return `•••• ${last4}`;
}

export function normalizeBankAccountNumber(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, "").trim();
}

export function validateBankAccountInput(input: {
  bank_name: string;
  account_number: string;
  account_holder_name: string;
}): { ok: true } | { ok: false; error: string } {
  const bankName = String(input.bank_name ?? "").trim();
  const accountNumber = normalizeBankAccountNumber(input.account_number);
  const holder = String(input.account_holder_name ?? "").trim();

  if (bankName.length < 2) return { ok: false, error: "Nama bank wajib diisi." };
  if (!/^\d{6,30}$/.test(accountNumber)) {
    return { ok: false, error: "Nomor rekening harus 6–30 digit angka." };
  }
  if (holder.length < 2) return { ok: false, error: "Nama pemilik rekening wajib diisi." };
  return { ok: true };
}
