import {
  buildSalesProcessTimeline,
  type SalesProcessStep,
} from "@/lib/bisnis/sales-process-timeline";
import {
  SETTLEMENT_INCOMING_LABELS,
  type SettlementIncomingType,
} from "@/lib/bisnis/sales-retur-expected";
import type { CreditNote, Expense, Invoice, Retur, ReturLine, SalesOrder, SalesOrderLine } from "@/lib/bisnis/types";

export type ChainPayment = {
  id: string;
  payment_kind?: string;
  notes?: string;
  reference_no?: string;
  payment_date?: string;
  created?: string;
  amount?: number;
};

export type SalesDocKind =
  | "sales_order"
  | "invoice"
  | "sales_return"
  | "credit_note"
  | "refund"
  | "recovery"
  | "expense";

export type SalesChainDocument = {
  id: string;
  kind: SalesDocKind;
  docNo: string;
  label: string;
  date?: string;
  amount?: number;
  status?: string;
  href?: string;
  parentReturNo?: string;
  meta?: string;
};

export type InvoiceQtySummary = {
  invoiceQty: number;
  returnedQty: number;
  activeQty: number;
};

export type InvoiceRelatedIndicators = {
  returCount: number;
  cnCount: number;
  refundCount: number;
  recoveryCount: number;
  totalRelated: number;
  badges: Array<"RET" | "CN" | "REFUND" | "RECOVERY">;
};

export type SalesActivityEvent = {
  id: string;
  label: string;
  at?: string;
  detail?: string;
  kind: "milestone" | "wms" | "retur" | "finance";
};

const RECOVERY_LABEL: Record<SettlementIncomingType, string> = SETTLEMENT_INCOMING_LABELS;

function fmtRecoveryLabel(type: SettlementIncomingType): string {
  return `Recovery ${RECOVERY_LABEL[type]}`;
}

/** Qty ringkasan — invoice tidak diubah; hitung dari histori retur non-batal. */
export function computeInvoiceQtySummary(
  soLines: SalesOrderLine[],
  returs: Retur[],
  returLines: ReturLine[],
): InvoiceQtySummary {
  const invoiceQty = soLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const activeReturIds = new Set(
    returs.filter((r) => r.status !== "cancelled").map((r) => r.id),
  );
  const returnedQty = returLines
    .filter((l) => activeReturIds.has(l.retur))
    .reduce((s, l) => s + (Number(l.qty) || 0), 0);
  return {
    invoiceQty,
    returnedQty,
    activeQty: Math.max(0, invoiceQty - returnedQty),
  };
}

export function buildSalesChainDocuments(input: {
  salesOrder?: SalesOrder | null;
  invoice?: Invoice | null;
  returs: Retur[];
  creditNotes: CreditNote[];
  payments: ChainPayment[];
  expenses: Expense[];
}): SalesChainDocument[] {
  const docs: SalesChainDocument[] = [];
  const so = input.salesOrder;
  const inv = input.invoice;
  const soId = so?.id ?? inv?.sales_order;

  if (so?.order_no) {
    docs.push({
      id: `so-${so.id}`,
      kind: "sales_order",
      docNo: so.order_no,
      label: "Sales Order",
      date: so.order_date || so.created,
      amount: so.total,
      status: so.status,
      href: `/bisnis/penjualan/${so.id}`,
    });
  }

  if (inv?.invoice_no) {
    docs.push({
      id: `inv-${inv.id}`,
      kind: "invoice",
      docNo: inv.invoice_no,
      label: "Invoice",
      date: inv.issue_date || inv.created,
      amount: inv.total,
      status: inv.status,
      href: `/bisnis/penjualan/${inv.id}`,
    });
  }

  const retursSorted = [...input.returs]
    .filter((r) => r.status !== "cancelled")
    .sort((a, b) => (a.created || "").localeCompare(b.created || ""));

  for (const r of retursSorted) {
    docs.push({
      id: `ret-${r.id}`,
      kind: "sales_return",
      docNo: r.retur_no,
      label: "Sales Return",
      date: r.created,
      amount: r.total,
      status: r.workflow_phase || r.status,
      href: soId ? `/bisnis/penjualan/${soId}#retur-${r.id}` : undefined,
    });
  }

  const cnSorted = [...input.creditNotes]
    .filter((c) => c.status !== "cancelled")
    .sort((a, b) => (a.cn_date || a.created || "").localeCompare(b.cn_date || b.created || ""));

  for (const cn of cnSorted) {
    const parentRetur = retursSorted.find((r) => r.id === cn.retur);
    docs.push({
      id: `cn-${cn.id}`,
      kind: "credit_note",
      docNo: cn.cn_no,
      label: "Credit Note",
      date: cn.cn_date || cn.created,
      amount: cn.amount,
      status: cn.status,
      href: inv ? `/bisnis/penjualan/${inv.id}#credit-notes` : undefined,
      parentReturNo: parentRetur?.retur_no,
    });
  }

  const refundPayments = input.payments.filter(
    (p) => p.payment_kind === "refund" || (p.notes ?? "").includes("[REFUND]"),
  );
  for (const p of refundPayments) {
    const returNo = p.reference_no?.trim();
    docs.push({
      id: `rf-${p.id}`,
      kind: "refund",
      docNo: returNo ? `Refund · ${returNo}` : `Refund · ${p.id.slice(0, 8)}`,
      label: "Refund",
      date: p.payment_date || p.created,
      amount: p.amount,
      href: inv ? `/bisnis/penjualan/${inv.id}#payments` : undefined,
      parentReturNo: returNo,
    });
  }

  for (const r of retursSorted) {
    const mpClaim = Number(r.mp_claim_amount) || 0;
    if (mpClaim > 0) {
      docs.push({
        id: `mr-${r.id}`,
        kind: "recovery",
        docNo: `Recovery MP · ${r.retur_no}`,
        label: "Marketplace Recovery",
        date: r.settled_at || r.completed_at || r.created,
        amount: mpClaim,
        href: soId ? `/bisnis/penjualan/${soId}#retur-${r.id}` : undefined,
        parentReturNo: r.retur_no,
      });
    }
  }

  const recoveryExpenses = input.expenses.filter((e) =>
    /recovery|kompensasi|marketplace|supplier|kurir|asuransi/i.test(e.description ?? ""),
  );
  for (const exp of recoveryExpenses) {
    docs.push({
      id: `exp-${exp.id}`,
      kind: "expense",
      docNo: exp.expense_no,
      label: "Settlement",
      date: exp.expense_date || exp.created,
      amount: exp.total ?? exp.amount,
      status: exp.status,
      parentReturNo: exp.reference_no,
      meta: exp.description,
    });
  }

  for (const r of retursSorted) {
    const est = r.settlement_estimate_json;
    if (!est) continue;
    try {
      const parsed = JSON.parse(est) as { items?: { type?: string; amount?: number }[] };
      for (const item of parsed.items ?? []) {
        if (!item.type || !(item.type in SETTLEMENT_INCOMING_LABELS)) continue;
        const amount = Number(item.amount) || 0;
        if (amount <= 0) continue;
        const type = item.type as SettlementIncomingType;
        const already = docs.some(
          (d) => d.kind === "recovery" && d.parentReturNo === r.retur_no && d.label.includes(RECOVERY_LABEL[type]),
        );
        if (already) continue;
        docs.push({
          id: `rec-est-${r.id}-${item.type}`,
          kind: "recovery",
          docNo: `${fmtRecoveryLabel(type)} · ${r.retur_no}`,
          label: fmtRecoveryLabel(type),
          date: r.settled_at || r.completed_at,
          amount,
          href: soId ? `/bisnis/penjualan/${soId}#retur-${r.id}` : undefined,
          parentReturNo: r.retur_no,
          status: r.settled_at ? "posted" : "estimated",
        });
      }
    } catch {
      /* ignore */
    }
  }

  return docs;
}

export function buildInvoiceRelatedIndicators(
  returs: Retur[],
  creditNotes: CreditNote[],
  payments: ChainPayment[],
): InvoiceRelatedIndicators {
  const activeReturs = returs.filter((r) => r.status !== "cancelled");
  const cnActive = creditNotes.filter((c) => c.status !== "cancelled");
  const refunds = payments.filter(
    (p) => p.payment_kind === "refund" || (p.notes ?? "").includes("[REFUND]"),
  );
  const recoveryCount =
    activeReturs.filter((r) => (Number(r.mp_claim_amount) || 0) > 0).length +
    activeReturs.filter((r) => {
      if (!r.settlement_estimate_json) return false;
      try {
        const p = JSON.parse(r.settlement_estimate_json) as { items?: { type?: string }[] };
        return (p.items ?? []).some((i) => i.type && i.type in SETTLEMENT_INCOMING_LABELS);
      } catch {
        return false;
      }
    }).length;

  const badges: InvoiceRelatedIndicators["badges"] = [];
  if (activeReturs.length) badges.push("RET");
  if (cnActive.length) badges.push("CN");
  if (refunds.length) badges.push("REFUND");
  if (recoveryCount > 0) badges.push("RECOVERY");

  const totalRelated =
    activeReturs.length + cnActive.length + refunds.length + (recoveryCount > 0 ? 1 : 0);

  return {
    returCount: activeReturs.length,
    cnCount: cnActive.length,
    refundCount: refunds.length,
    recoveryCount,
    totalRelated,
    badges,
  };
}

function pushTimeline(out: SalesActivityEvent[], event: SalesActivityEvent) {
  if (out.some((e) => e.id === event.id)) return;
  out.push(event);
}

export function buildSalesDocumentActivityTimeline(input: {
  salesOrder?: SalesOrder | null;
  invoice?: Invoice | null;
  returs: Retur[];
  creditNotes: CreditNote[];
  payments: ChainPayment[];
}): SalesActivityEvent[] {
  const events: SalesActivityEvent[] = [];
  const so = input.salesOrder;
  const inv = input.invoice;

  if (so) {
    for (const step of buildSalesProcessTimeline(so)) {
      if (step.status === "pending") continue;
      pushTimeline(events, {
        id: `wms-${step.id}`,
        label: step.label,
        at: step.at,
        detail: step.detail,
        kind: step.id === "created" ? "milestone" : "wms",
      });
    }
  } else if (inv) {
    pushTimeline(events, {
      id: "inv-created",
      label: "Invoice diterbitkan",
      at: inv.issue_date || inv.created,
      kind: "milestone",
    });
  }

  if (inv && so) {
    pushTimeline(events, {
      id: "inv-issued",
      label: "Invoice diterbitkan",
      at: inv.issue_date || inv.created,
      kind: "milestone",
    });
  }

  const retursSorted = [...input.returs]
    .filter((r) => r.status !== "cancelled")
    .sort((a, b) => (a.created || "").localeCompare(b.created || ""));

  for (const r of retursSorted) {
    pushTimeline(events, {
      id: `ret-created-${r.id}`,
      label: "Retur penjualan dibuat",
      at: r.created,
      detail: r.retur_no,
      kind: "retur",
    });
    if (r.wms_received_at) {
      pushTimeline(events, {
        id: `ret-wms-${r.id}`,
        label: "WMS menerima retur",
        at: r.wms_received_at,
        detail: r.retur_no,
        kind: "retur",
      });
    }
    if (r.exception_status === "open") {
      pushTimeline(events, {
        id: `ret-exc-${r.id}`,
        label: "Klarifikasi retur",
        at: r.wms_received_at || r.updated,
        detail: r.retur_no,
        kind: "retur",
      });
    }
    if (r.exception_status === "resolved") {
      pushTimeline(events, {
        id: `ret-exc-res-${r.id}`,
        label: "Bisnis menyetujui retur",
        at: r.updated,
        detail: r.retur_no,
        kind: "retur",
      });
    }
    if (r.stock_posted_at) {
      pushTimeline(events, {
        id: `ret-stock-${r.id}`,
        label: "Stok retur diposting",
        at: r.stock_posted_at,
        detail: r.retur_no,
        kind: "retur",
      });
    }
    if (r.completed_at) {
      pushTimeline(events, {
        id: `ret-done-${r.id}`,
        label: "Retur diselesaikan",
        at: r.completed_at,
        detail: r.retur_no,
        kind: "retur",
      });
    }
    if (r.settled_at) {
      pushTimeline(events, {
        id: `ret-settle-${r.id}`,
        label: "Settlement diposting",
        at: r.settled_at,
        detail: r.retur_no,
        kind: "finance",
      });
    }
  }

  for (const cn of input.creditNotes.filter((c) => c.status !== "cancelled")) {
    pushTimeline(events, {
      id: `cn-${cn.id}`,
      label: "Credit note dibuat",
      at: cn.cn_date || cn.created,
      detail: cn.cn_no,
      kind: "finance",
    });
  }

  for (const p of input.payments.filter(
    (x) => x.payment_kind === "refund" || (x.notes ?? "").includes("[REFUND]"),
  )) {
    pushTimeline(events, {
      id: `rf-${p.id}`,
      label: "Refund diproses",
      at: p.payment_date || p.created,
      detail: p.reference_no,
      kind: "finance",
    });
  }

  return events.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return ta - tb;
  });
}

export function processStepsToActivity(steps: SalesProcessStep[]): SalesActivityEvent[] {
  return steps
    .filter((s) => s.status !== "pending")
    .map((s) => ({
      id: `proc-${s.id}`,
      label: s.label,
      at: s.at,
      detail: s.detail,
      kind: "wms" as const,
    }));
}
