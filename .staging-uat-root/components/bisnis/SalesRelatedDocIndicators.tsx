"use client";

import type { InvoiceRelatedIndicators } from "@/lib/bisnis/sales-document-chain";

const BADGE_CLS: Record<InvoiceRelatedIndicators["badges"][number], string> = {
  RET: "bg-amber-50 text-amber-800 ring-amber-200",
  CN: "bg-rose-50 text-rose-800 ring-rose-200",
  REFUND: "bg-orange-50 text-orange-800 ring-orange-200",
  RECOVERY: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

type Props = {
  indicators?: InvoiceRelatedIndicators | null;
};

export function SalesRelatedDocIndicators({ indicators }: Props) {
  if (!indicators || indicators.totalRelated <= 0) return null;

  if (indicators.badges.length === 1 && indicators.returCount > 0 && indicators.badges[0] === "RET") {
    return (
      <span className="text-[11px] font-medium text-slate-500">
        ↳ RET ×{indicators.returCount}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {indicators.badges.map((b) => (
        <span
          key={b}
          className={`inline-flex rounded px-1 py-px text-[10px] font-semibold ring-1 ring-inset ${BADGE_CLS[b]}`}
        >
          {b}
        </span>
      ))}
    </span>
  );
}
