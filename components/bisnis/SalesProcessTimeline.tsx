"use client";

import {
  buildSalesProcessTimeline,
  formatProcessStepTime,
  type SalesProcessStep,
} from "@/lib/bisnis/sales-process-timeline";
import type { SalesOrder } from "@/lib/bisnis/types";

type Props = {
  salesOrder: Pick<
    SalesOrder,
    | "created"
    | "order_date"
    | "status"
    | "send_to_warehouse_at"
    | "outbound_workflow_json"
    | "pk_no"
    | "wms_booking_no"
    | "shipped_date"
    | "expand"
  > | null | undefined;
  emptyLabel: string;
};

function dotClass(status: SalesProcessStep["status"]): string {
  if (status === "done") return "bg-emerald-500";
  if (status === "active") return "bg-indigo-500 animate-pulse";
  return "bg-slate-300";
}

function labelClass(status: SalesProcessStep["status"]): string {
  if (status === "pending") return "text-slate-400 font-normal";
  return "text-slate-700 font-medium";
}

export function SalesProcessTimeline({ salesOrder, emptyLabel }: Props) {
  const steps = buildSalesProcessTimeline(salesOrder);

  if (steps.length === 0) {
    return <p className="text-[11px] leading-relaxed text-slate-400">{emptyLabel}</p>;
  }

  return (
    <ol className="space-y-0">
      {steps.map((step) => {
        const time = formatProcessStepTime(step.at);
        const parts = [
          step.actor,
          time,
        ].filter(Boolean);

        return (
          <li
            key={step.id}
            className="flex items-start gap-2 border-b border-slate-100 py-1.5 last:border-b-0"
          >
            <span
              className={`mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(step.status)}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1 leading-snug">
              <p className="text-[11px] text-slate-600">
                <span className={labelClass(step.status)}>{step.label}</span>
                {parts.length > 0 ? (
                  <>
                    <span className="text-slate-300"> · </span>
                    <span className="text-slate-500">{parts.join(" · ")}</span>
                  </>
                ) : null}
              </p>
              {step.detail ? (
                <p className="mt-0.5 text-[10px] text-slate-400">{step.detail}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
