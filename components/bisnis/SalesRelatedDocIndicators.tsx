"use client";

import type { InvoiceRelatedIndicators } from "@/lib/bisnis/sales-document-chain";

const BADGE_META: Record<
  InvoiceRelatedIndicators["badges"][number],
  { label: string; title: string; cls: string }
> = {
  RET: {
    label: "Retur",
    title: "Ada dokumen retur terkait",
    cls: "bg-amber-50 text-amber-800 ring-amber-200/80",
  },
  CN: {
    label: "CN",
    title: "Ada credit note",
    cls: "bg-rose-50 text-rose-800 ring-rose-200/80",
  },
  REFUND: {
    label: "Pengembalian",
    title: "Ada refund",
    cls: "bg-orange-50 text-orange-800 ring-orange-200/80",
  },
  RECOVERY: {
    label: "Pemulihan",
    title: "Ada recovery pembayaran",
    cls: "bg-teal-50 text-teal-800 ring-teal-200/80",
  },
};

type Props = {
  indicators?: InvoiceRelatedIndicators | null;
};

export function SalesRelatedDocIndicators({ indicators }: Props) {
  if (!indicators || indicators.totalRelated <= 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {indicators.badges.map((b) => {
        const meta = BADGE_META[b];
        const count =
          b === "RET" && indicators.returCount > 1 ? ` · ${indicators.returCount}` : "";
        return (
          <span
            key={b}
            title={meta.title}
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.cls}`}
          >
            {meta.label}
            {count}
          </span>
        );
      })}
    </span>
  );
}
