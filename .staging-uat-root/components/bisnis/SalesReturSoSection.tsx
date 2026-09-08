"use client";

import Link from "next/link";
import { SalesReturWmsExceptionPanel } from "@/components/bisnis/SalesReturWmsExceptionPanel";
import { SalesReturSettlementPanel } from "@/components/bisnis/SalesReturSettlementPanel";
import type { Retur } from "@/lib/bisnis/types";

type Props = {
  salesOrderId: string;
  /** Retur terbuka (opsional, dari parent) */
  openRetur?: Retur | null;
  /** Riwayat retur dari parent — hindari fetch duplikat */
  returs?: Retur[] | null;
  onRefresh?: () => void | Promise<void>;
};

function findActiveRetur(openRetur: Retur | null | undefined, history: Retur[]): Retur | null {
  return (
    openRetur ??
    history.find(
      (r) =>
        r.status !== "completed" &&
        r.status !== "cancelled" &&
        r.workflow_phase !== "completed",
    ) ??
    null
  );
}

export function SalesReturSoSection({ salesOrderId, openRetur, returs, onRefresh }: Props) {
  const history = returs ?? [];
  const active = findActiveRetur(openRetur, history);

  const refreshAll = async () => {
    await onRefresh?.();
  };

  if (!active) return null;

  return (
    <div className="space-y-3">
      <div id={`retur-${active.id}`}>
        <SalesReturWmsExceptionPanel retur={active} onCompleted={refreshAll} />
        <SalesReturSettlementPanel retur={active} onSettled={refreshAll} />
        {active.workflow_phase === "awaiting_wms" ||
        (!active.workflow_phase && active.status === "draft") ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-mono font-semibold">{active.retur_no}</span> — menunggu WMS.{" "}
            <Link
              href={`/gudang/penerimaan/retur/${active.id}`}
              className="font-semibold text-violet-700 hover:underline"
            >
              Buka penerimaan →
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
