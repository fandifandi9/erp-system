export const BANK_TRANSFER_MARKER = "---info-transfer---";

export type BankTransferInfo = {
  enabled: boolean;
  bank_name: string;
  account_name: string;
  account_number: string;
};

export const emptyBankTransferInfo = (): BankTransferInfo => ({
  enabled: false,
  bank_name: "",
  account_name: "",
  account_number: "",
});

function parseBankBlock(block: string): BankTransferInfo {
  let bank_name = "";
  let account_name = "";
  let account_number = "";
  for (const line of block.split("\n")) {
    const b = line.match(/^Bank:\s*(.*)$/i);
    if (b) bank_name = b[1].trim();
    const a = line.match(/^Nama rekening:\s*(.*)$/i);
    if (a) account_name = a[1].trim();
    const n = line.match(/^Nomor rekening:\s*(.*)$/i);
    if (n) account_number = n[1].trim();
  }
  return {
    enabled: !!(bank_name || account_name || account_number),
    bank_name,
    account_name,
    account_number,
  };
}

export function appendBankTransferToNotes(
  notes: string | undefined,
  bank: BankTransferInfo,
): string | undefined {
  const base = (notes ?? "").trim();
  if (!bank.enabled) return base || undefined;
  const block =
    `${BANK_TRANSFER_MARKER}\n` +
    `Bank: ${bank.bank_name.trim()}\n` +
    `Nama rekening: ${bank.account_name.trim()}\n` +
    `Nomor rekening: ${bank.account_number.trim()}`;
  return base ? `${base}\n${block}` : block;
}

export function parseNotesWithBankTransfer(raw?: string | null): {
  textNotes: string;
  bank: BankTransferInfo;
} {
  if (!raw?.trim()) return { textNotes: "", bank: emptyBankTransferInfo() };
  const idx = raw.indexOf(BANK_TRANSFER_MARKER);
  if (idx === -1) return { textNotes: raw.trim(), bank: emptyBankTransferInfo() };
  const textNotes = raw.slice(0, idx).replace(/\n+$/, "").trim();
  const block = raw.slice(idx + BANK_TRANSFER_MARKER.length).replace(/^\n+/, "");
  return { textNotes, bank: parseBankBlock(block) };
}

export function formatBankTransferDisplay(bank: BankTransferInfo): string | null {
  if (!bank.enabled) return null;
  const parts: string[] = [];
  if (bank.bank_name) parts.push(bank.bank_name);
  if (bank.account_number) parts.push(bank.account_number);
  if (bank.account_name) parts.push(`a.n. ${bank.account_name}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

