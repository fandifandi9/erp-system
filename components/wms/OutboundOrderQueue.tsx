"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { SalesOrder } from "@/lib/bisnis/types";
import { WmsCard, WmsSectionTitle } from "@/components/wms/ui";
import { describeOrderForQueue } from "@/lib/wms/outbound-queues";
import {
  getWmsStageSinceIso,
  getWmsStageWaitMinutes,
  type WmsTimeDisplayMode,
  wmsStageWaitToneClass,
} from "@/lib/wms/wms-queue-time";
import { useLocale } from "@/components/LocaleProvider";
import {
  formatWmsStageWaitLineLocalized,
  getPickupGateLabel,
  getWmsStageLabel,
} from "@/lib/i18n/wms-formatters";

type Props = {
  title: string;
  subtitle: string;
  orders: SalesOrder[];
  selectedId?: string;
  loading: boolean;
  emptyText: string;
  onSelect: (so: SalesOrder) => void;
  /** active = menit/jam di tahap ini; history = tanggal selesai */
  timeMode?: WmsTimeDisplayMode;
  /** Mode multi-paket: centang untuk batch serah terima */
  batchIds?: string[];
  onToggleBatch?: (so: SalesOrder) => void;
};

export function OutboundOrderQueue({
  title,
  subtitle,
  orders,
  selectedId,
  loading,
  emptyText,
  onSelect,
  timeMode = "active",
  batchIds,
  onToggleBatch,
}: Props) {
  const { t, locale } = useLocale();
  const batchMode = Boolean(onToggleBatch);
  const pathname = usePathname();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
  }, [pathname]);

  useEffect(() => {
    if (timeMode !== "active") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [timeMode, pathname]);

  return (
    <WmsCard>
      <WmsSectionTitle title={title} subtitle={subtitle} />
      {loading ? (
        <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-indigo-600" />
      ) : orders.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto">
          {orders.map((o) => {
            const meta = describeOrderForQueue(o, { nowMs, timeMode });
            const inBatch = batchIds?.includes(o.id);
            const hasPk = meta.pkNo !== "—";
            const waitLine = formatWmsStageWaitLineLocalized(t, locale, o, {
              nowMs,
              mode: timeMode,
            });
            const waitMin =
              timeMode === "active"
                ? getWmsStageWaitMinutes(getWmsStageSinceIso(o), nowMs)
                : null;
            const waitClass =
              timeMode === "active" ? wmsStageWaitToneClass(waitMin) : "text-slate-600";
            return (
              <li key={o.id}>
                <div
                  className={
                    "flex w-full gap-2 rounded-lg border px-2 py-2 text-left text-sm transition " +
                    (inBatch
                      ? "border-cyan-400 bg-cyan-50"
                      : selectedId === o.id
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-slate-200")
                  }
                >
                  {batchMode ? (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={!!inBatch}
                      onChange={() => onToggleBatch?.(o)}
                      aria-label={`Batch PK ${meta.pkNo}`}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelect(o)}
                    className="min-w-0 flex-1 text-left hover:opacity-90"
                  >
                    {hasPk ? (
                      <p className="font-mono text-xl font-bold tracking-wide text-indigo-700">
                        PK {meta.pkNo}
                      </p>
                    ) : (
                      <p className="font-mono text-sm font-medium text-amber-800">{t("wms.order.pkNotCreatedQueue")}</p>
                    )}
                    <p className="text-[11px] text-slate-500">
                      SO: <span className="font-mono">{meta.orderNo}</span>
                    </p>
                    <p className="text-xs text-slate-600">{meta.warehouseName}</p>
                    <p className={`mt-0.5 text-[10px] font-medium ${waitClass}`}>{waitLine}</p>
                    {timeMode === "active" ? (
                      <p className="mt-0.5 text-[10px] font-medium text-amber-800">
                        {getWmsStageLabel(t, meta.stage)}
                        {meta.pickupGate ? ` · ${getPickupGateLabel(t, meta.pickupGate)}` : ""}
                      </p>
                    ) : null}
                    {meta.pickupGate === "menunggu_awb" ? (
                      <p className="mt-0.5 text-[10px] font-semibold text-amber-900">
                        {t("wms.order.uploadAwbToContinue")}
                      </p>
                    ) : null}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && orders.length > 0 ? (
        <p className="mt-2 text-center text-xs text-slate-400">{t("wms.order.orderCount", { count: orders.length })}</p>
      ) : null}
    </WmsCard>
  );
}
