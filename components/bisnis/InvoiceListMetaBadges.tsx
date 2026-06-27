"use client";

import { getInvoiceListDisplay } from "@/lib/bisnis/invoice-list-display";
import type { Invoice, SalesOrder } from "@/lib/bisnis/types";

type Props = {
  invoice: Invoice;
  salesOrder?: SalesOrder | null;
  compact?: boolean;
};

export function InvoiceListMetaBadges({ invoice, salesOrder, compact }: Props) {
  const meta = getInvoiceListDisplay(invoice, salesOrder);
  const pill = compact
    ? "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
    : "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`${pill} bg-slate-100 text-slate-700 ring-slate-200`}>{meta.channelLabel}</span>
      <span className={`${pill} ${meta.badgeCls}`}>{meta.badgeLabel}</span>
    </span>
  );
}
