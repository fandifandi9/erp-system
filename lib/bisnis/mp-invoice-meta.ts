import type { Invoice, StoreChannelAccount } from "./types";

const FEE_MARKER = "[MP-FEES]";

/** Catatan manusia + JSON biaya untuk invoice/SO dari import MP. */
export function buildMarketplaceInvoiceNotes(opts: {
  channelName: string;
  accountName: string;
  mpOrderNo: string;
  mpBuyerName?: string;
  feeBreakdownJson: object;
}): string {
  const lines = [
    "[SERBA-MP]",
    `Marketplace: ${opts.channelName}`,
    `Akun toko: ${opts.accountName}`,
    `No. pesanan MP: ${opts.mpOrderNo}`,
  ];
  if (opts.mpBuyerName?.trim()) {
    lines.push(`Pembeli (MP): ${opts.mpBuyerName.trim()}`);
  }
  lines.push("", `${FEE_MARKER}${JSON.stringify(opts.feeBreakdownJson)}`);
  return lines.join("\n");
}

export function parseMarketplaceNotes(notes?: string): {
  headerLines: string[];
  feeJson: Record<string, unknown> | null;
} {
  if (!notes) return { headerLines: [], feeJson: null };
  const idx = notes.indexOf(FEE_MARKER);
  const head = idx >= 0 ? notes.slice(0, idx).trim() : notes.trim();
  const headerLines = head
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "[SERBA-MP]");
  let feeJson: Record<string, unknown> | null = null;
  if (idx >= 0) {
    try {
      feeJson = JSON.parse(notes.slice(idx + FEE_MARKER.length)) as Record<string, unknown>;
    } catch {
      feeJson = null;
    }
  }
  return { headerLines, feeJson };
}

export function marketplaceLabelFromInvoice(invoice: Invoice): string | null {
  if (invoice.source !== "marketplace_import") return null;
  const ch = invoice.expand?.sales_channel?.name;
  const acc = invoice.expand?.store_channel_account?.account_name;
  if (ch && acc) return `${ch} · ${acc}`;
  if (ch) return ch;
  if (acc) return acc;
  return "Marketplace";
}

export function accountChannelNames(account?: StoreChannelAccount): {
  channelName: string;
  accountName: string;
} {
  return {
    channelName: account?.expand?.channel?.name ?? "Marketplace",
    accountName: account?.account_name ?? "—",
  };
}
