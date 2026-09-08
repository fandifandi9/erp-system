"use client";

import { WMS_OUTBOUND_FLOW_STEPS } from "@/lib/wms/navigation";
import { outboundStageStepIndex, type OutboundStage } from "@/lib/wms/outbound-workflow";
import { useLocale } from "@/components/LocaleProvider";

const FLOW_LABEL_KEYS: Record<(typeof WMS_OUTBOUND_FLOW_STEPS)[number]["key"], string> = {
  picking: "wms.flow.picking",
  validate_pack: "wms.flow.validatePack",
  ready_pickup: "wms.flow.readyPickup",
  completed: "wms.flow.completed",
};

export function OutboundFlowBar({ stage }: { stage: OutboundStage }) {
  const { t } = useLocale();
  const current = outboundStageStepIndex(stage);
  return (
    <div className="flex flex-wrap gap-1">
      {WMS_OUTBOUND_FLOW_STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <span
            className={
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide " +
              (i === current
                ? `${s.color} text-white ring-2 ring-offset-1 ring-indigo-300`
                : i < current
                  ? "bg-slate-200 text-slate-600"
                  : "bg-slate-100 text-slate-400")
            }
          >
            {t(FLOW_LABEL_KEYS[s.key])}
          </span>
          {i < WMS_OUTBOUND_FLOW_STEPS.length - 1 && (
            <span className="text-slate-300">→</span>
          )}
        </div>
      ))}
    </div>
  );
}
