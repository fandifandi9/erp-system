"use client";

import { WMS_OUTBOUND_FLOW_STEPS } from "@/lib/wms/navigation";
import type { OutboundStage } from "@/lib/wms/outbound-workflow";

const STAGE_INDEX: Record<OutboundStage, number> = {
  pick_pending: 0,
  pick_done: 1,
  validate_pending: 1,
  validate_done: 2,
  pack_done: 3,
  pickup_done: 4,
};

export function OutboundFlowBar({ stage }: { stage: OutboundStage }) {
  const active = STAGE_INDEX[stage] ?? 0;
  return (
    <div className="flex flex-wrap gap-1">
      {WMS_OUTBOUND_FLOW_STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <span
            className={
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide " +
              (i <= active ? `${s.color} text-white` : "bg-slate-100 text-slate-400")
            }
          >
            {s.label}
          </span>
          {i < WMS_OUTBOUND_FLOW_STEPS.length - 1 && (
            <span className="text-slate-300">→</span>
          )}
        </div>
      ))}
    </div>
  );
}
