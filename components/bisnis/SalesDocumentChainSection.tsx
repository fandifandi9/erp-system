"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCreditNotesForInvoice,
  fetchExpensesForReturNos,
  fetchReturLinesForReturIds,
  fetchRetursForInvoice,
  fetchRetursForSalesOrder,
  type Payment,
} from "@/lib/bisnis/client";
import {
  buildSalesChainDocuments,
  buildSalesDocumentActivityTimeline,
  computeInvoiceQtySummary,
} from "@/lib/bisnis/sales-document-chain";
import type { CreditNote, Expense, Invoice, Retur, ReturLine, SalesOrder, SalesOrderLine } from "@/lib/bisnis/types";
import { SalesDocumentActivityTimeline } from "@/components/bisnis/SalesDocumentActivityTimeline";
import { SalesDocumentChainPanel } from "@/components/bisnis/SalesDocumentChainPanel";
import { SalesInvoiceQtySummary } from "@/components/bisnis/SalesInvoiceQtySummary";

type Props = {
  invoice?: Invoice | null;
  salesOrder?: SalesOrder | null;
  lines: SalesOrderLine[];
  payments: Payment[];
  /** Retur dari parent — skip query retur jika disediakan */
  returs?: Retur[] | null;
  /** Tunda fetch sampai true (lazy load setelah konten utama) */
  enabled?: boolean;
  onRefreshKey?: number;
};

async function mergeRetursForChain(
  invoiceId: string | undefined,
  soId: string | undefined,
  preloaded?: Retur[] | null,
): Promise<Retur[]> {
  if (preloaded != null) {
    return preloaded.filter((r) => r.status !== "cancelled");
  }
  const [byInvoice, bySo] = await Promise.all([
    invoiceId ? fetchRetursForInvoice(invoiceId).catch(() => []) : Promise.resolve([]),
    soId ? fetchRetursForSalesOrder(soId).catch(() => []) : Promise.resolve([]),
  ]);
  const returMap = new Map<string, Retur>();
  for (const r of [...byInvoice, ...bySo]) {
    if (r.status !== "cancelled") returMap.set(r.id, r);
  }
  return [...returMap.values()].sort((a, b) => (a.created || "").localeCompare(b.created || ""));
}

export function SalesDocumentChainSection({
  invoice,
  salesOrder,
  lines,
  payments,
  returs: retursProp,
  enabled = true,
  onRefreshKey,
}: Props) {
  const [returs, setReturs] = useState<Retur[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [returLines, setReturLines] = useState<ReturLine[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

  const soId = salesOrder?.id ?? invoice?.sales_order;
  const invoiceId = invoice?.id;

  const load = useCallback(async () => {
    if (!enabled || (!soId && !invoiceId)) {
      setReturs([]);
      setCreditNotes([]);
      setReturLines([]);
      setExpenses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const returRows = await mergeRetursForChain(invoiceId, soId, retursProp);
      const [cnRows, lineRows, expRows] = await Promise.all([
        invoiceId ? fetchCreditNotesForInvoice(invoiceId).catch(() => []) : Promise.resolve([]),
        fetchReturLinesForReturIds(returRows.map((r) => r.id)).catch(() => []),
        fetchExpensesForReturNos(returRows.map((r) => r.retur_no)).catch(() => []),
      ]);

      setReturs(returRows);
      setCreditNotes(cnRows);
      setReturLines(lineRows);
      setExpenses(expRows);
    } finally {
      setLoading(false);
    }
  }, [enabled, invoiceId, soId, retursProp]);

  useEffect(() => {
    void load();
  }, [load, onRefreshKey]);

  const qtySummary = useMemo(
    () => computeInvoiceQtySummary(lines, returs, returLines),
    [lines, returs, returLines],
  );

  const documents = useMemo(
    () =>
      buildSalesChainDocuments({
        salesOrder,
        invoice,
        returs,
        creditNotes,
        payments,
        expenses,
      }),
    [salesOrder, invoice, returs, creditNotes, payments, expenses],
  );

  const timeline = useMemo(
    () =>
      buildSalesDocumentActivityTimeline({
        salesOrder,
        invoice,
        returs,
        creditNotes,
        payments,
      }),
    [salesOrder, invoice, returs, creditNotes, payments],
  );

  if (!enabled) return null;

  const showQty = lines.length > 0;

  return (
    <div className="space-y-4">
      {showQty ? <SalesInvoiceQtySummary summary={qtySummary} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <SalesDocumentChainPanel documents={documents} loading={loading} />
        <SalesDocumentActivityTimeline events={timeline} loading={loading} />
      </div>
    </div>
  );
}
