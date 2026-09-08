"use client";

import Link from "next/link";
import { Check, Mail, Store, Warehouse } from "lucide-react";
import {
  getOutboundStageFromSo,
  outboundStageStepIndex,
  parseOutboundWorkflow,
  type WmsOrderStage,
} from "@/lib/wms/outbound-workflow";
import { WMS_OUTBOUND_FLOW_STEPS } from "@/lib/wms/navigation";
import type { SalesOrder } from "@/lib/bisnis/types";
import { useLocale } from "@/components/LocaleProvider";
import { isWmsPickupFulfillment } from "@/lib/wms/fulfillment-mode";
import { getPkFromSo } from "@/lib/wms/pk-identity";
import { pkCodeBody } from "@/lib/wms/pk-number";

const STEP_LABEL_KEYS: Record<(typeof WMS_OUTBOUND_FLOW_STEPS)[number]["key"], string> = {
  picking: "sales.wmsStage.picking",
  validate_pack: "sales.wmsStage.packing",
  ready_pickup: "sales.wmsStage.pickup",
  completed: "sales.wmsStage.done",
};

const STEP_ACTIVE_KEYS: Record<(typeof WMS_OUTBOUND_FLOW_STEPS)[number]["key"], string> = {
  picking: "sales.wmsStage.activePicking",
  validate_pack: "sales.wmsStage.activePacking",
  ready_pickup: "sales.wmsStage.activePickup",
  completed: "sales.wmsStage.activeDone",
};

function stageToFlowIndex(stage: WmsOrderStage): number {
  if (stage === "new_order") return -1;
  if (stage === "cancelled" || stage === "validation_failed") return -2;
  return outboundStageStepIndex(stage);
}

/** SO lewat antrean gudang (picking → packing → pickup). */
export function isSalesOrderViaWms(
  order: Pick<SalesOrder, "send_to_warehouse_at" | "warehouse_process_status" | "outbound_workflow_json">,
): boolean {
  return !!(order.send_to_warehouse_at || order.warehouse_process_status || order.outbound_workflow_json);
}

type Props = {
  order: SalesOrder;
  href?: string;
};

function PkEmailListHint({ order }: { order: SalesOrder }) {
  const { t } = useLocale();
  if (!isWmsPickupFulfillment(order)) {
    return (
      <span className="text-[9px] font-medium leading-tight text-slate-500">
        {t("sales.wmsStage.modeShip")}
      </span>
    );
  }

  const pkRaw = getPkFromSo(order);
  const pkNo = pkRaw ? pkCodeBody(pkRaw) : null;
  const sendCount = parseOutboundWorkflow(order.outbound_workflow_json).pk_email?.send_count ?? 0;

  return (
    <span className="inline-flex flex-col gap-0.5 text-[9px] leading-tight">
      <span className="font-semibold text-violet-800">{t("sales.wmsStage.modePickup")}</span>
      <span className="font-mono text-indigo-800">
        {pkNo ? t("sales.wmsStage.pkNo", { pk: pkNo }) : t("sales.wmsStage.pkPending")}
      </span>
      <span
        className={
          "inline-flex items-center gap-0.5 font-medium " +
          (sendCount > 0 ? "text-emerald-700" : "text-amber-800")
        }
        title={
          sendCount > 0
            ? t("sales.wmsStage.pkEmailSentTip", { count: String(sendCount) })
            : t("sales.wmsStage.pkEmailPendingTip")
        }
      >
        <Mail className="h-2.5 w-2.5 shrink-0" />
        {sendCount > 0
          ? t("sales.wmsStage.pkEmailSent", { count: String(sendCount) })
          : t("sales.wmsStage.pkEmailPending")}
      </span>
    </span>
  );
}

/**
 * Pembeda metode: Lewat WMS (tahapan gudang) vs Penjualan langsung.
 * Mode ambil sendiri: tampilkan PK + status email ke pelanggan.
 */
export function SalesWmsStageCell({ order, href }: Props) {
  const { t } = useLocale();
  const viaWms = isSalesOrderViaWms(order);

  if (!viaWms) {
    const content = (
      <span
        title={t("sales.wmsStage.directHint")}
        className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900"
      >
        <Store className="h-3 w-3 shrink-0" />
        {t("sales.wmsStage.direct")}
      </span>
    );
    if (href) {
      return (
        <Link href={href} className="block hover:opacity-90">
          {content}
        </Link>
      );
    }
    return content;
  }

  const stage = getOutboundStageFromSo(order);
  const idx = stageToFlowIndex(stage);

  if (idx === -2) {
    const content = (
      <div className="inline-flex flex-col gap-0.5">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-900">
          <Warehouse className="h-2.5 w-2.5" />
          {t("sales.wmsStage.viaWms")}
        </span>
        <span className="text-[9px] font-semibold text-red-700">
          {stage === "cancelled" ? t("sales.wmsStage.cancelled") : t("sales.wmsStage.failed")}
        </span>
        <PkEmailListHint order={order} />
      </div>
    );
    if (href) {
      return (
        <Link href={href} className="block hover:opacity-90">
          {content}
        </Link>
      );
    }
    return content;
  }

  const activeLabel =
    idx >= 0 && idx < WMS_OUTBOUND_FLOW_STEPS.length
      ? t(STEP_ACTIVE_KEYS[WMS_OUTBOUND_FLOW_STEPS[idx].key])
      : idx === -1
        ? t("sales.wmsStage.waiting")
        : "";

  const content = (
    <div className="inline-flex flex-col gap-0.5" title={activeLabel}>
      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-900">
        <Warehouse className="h-2.5 w-2.5" />
        {t("sales.wmsStage.viaWms")}
      </span>
      <div className="inline-flex items-center gap-px">
        {WMS_OUTBOUND_FLOW_STEPS.map((s, i) => {
          const isCurrent = idx === i;
          const isDone = idx > i;
          const label = t(STEP_LABEL_KEYS[s.key]);
          const tip = isDone
            ? `${label} · ${t("sales.wmsStage.passed")}`
            : isCurrent
              ? `${label} · ${t("sales.wmsStage.current")}`
              : `${label} · ${t("sales.wmsStage.upcoming")}`;

          return (
            <div key={s.key} className="inline-flex items-center gap-px">
              <span
                title={tip}
                className={
                  "inline-flex h-4 items-center gap-0.5 rounded px-1 text-[9px] font-bold uppercase leading-none tracking-wide " +
                  (isCurrent
                    ? `${s.color} text-white`
                    : isDone
                      ? "bg-emerald-100 text-emerald-800"
                      : "border border-dashed border-slate-200 bg-slate-50 text-slate-400")
                }
              >
                {isDone ? <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} /> : null}
                {label}
              </span>
              {i < WMS_OUTBOUND_FLOW_STEPS.length - 1 ? (
                <span
                  className={"mx-px h-px w-1.5 " + (isDone ? "bg-emerald-300" : "bg-slate-200")}
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {activeLabel ? (
        <span className="text-[9px] font-medium leading-tight text-slate-500">{activeLabel}</span>
      ) : null}
      <PkEmailListHint order={order} />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-90">
        {content}
      </Link>
    );
  }
  return content;
}
