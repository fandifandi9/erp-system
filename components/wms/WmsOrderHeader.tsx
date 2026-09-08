"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SalesOrder } from "@/lib/bisnis/types";
import { buildWmsOrderHeader, resolveInvoiceNoForSo } from "@/lib/wms/wms-order-display";
import { WMS_STAGE_UI, getOutboundStageFromSo } from "@/lib/wms/outbound-workflow";
import { getPkIdentityView } from "@/lib/wms/pk-identity";
import {
  getWmsStageSinceIso,
  getWmsStageWaitMinutes,
  type WmsTimeDisplayMode,
  wmsStageWaitToneClass,
} from "@/lib/wms/wms-queue-time";
import { useLocale } from "@/components/LocaleProvider";
import { formatWmsStageWaitLineLocalized, getWmsStageLabel } from "@/lib/i18n/wms-formatters";

export function WmsOrderHeader({
  so,
  timeMode = "active",
}: {
  so: SalesOrder;
  timeMode?: WmsTimeDisplayMode;
}) {
  const { t, locale } = useLocale();
  const h = buildWmsOrderHeader(so);
  const pk = getPkIdentityView(so);
  const stage = getOutboundStageFromSo(so);
  const ui = WMS_STAGE_UI[stage];
  const pathname = usePathname();
  /** Di picking invoice belum jadi — selalu tampilkan SO sebagai referensi. */
  const preferSoRef = pathname.includes("/picking");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [resolvedInvoiceNo, setResolvedInvoiceNo] = useState<string | null>(h.invoiceNo);

  useEffect(() => {
    setNowMs(Date.now());
  }, [pathname, so.id]);

  useEffect(() => {
    setResolvedInvoiceNo(h.invoiceNo);
    if (preferSoRef || h.invoiceNo) return;
    let cancelled = false;
    void resolveInvoiceNoForSo(so).then((n) => {
      const no = n.trim();
      if (!cancelled && no && no !== "—") setResolvedInvoiceNo(no);
    });
    return () => {
      cancelled = true;
    };
  }, [so, h.invoiceNo, preferSoRef]);

  const mode = timeMode ?? (stage === "completed" || stage === "cancelled" ? "history" : "active");
  const waitLine = formatWmsStageWaitLineLocalized(t, locale, so, { nowMs, mode });
  const waitMin =
    mode === "active" ? getWmsStageWaitMinutes(getWmsStageSinceIso(so), nowMs) : null;
  const invoiceNo = resolvedInvoiceNo?.trim() || null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {pk.pkNo !== "—" ? (
            <p className="flex items-baseline gap-1.5 font-mono text-2xl font-bold tracking-wide text-indigo-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">PK</span>
              <span>{pk.pkNo}</span>
            </p>
          ) : (
            <p className="text-sm font-medium text-amber-800">{t("wms.order.pkNotCreated")}</p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">
            {!preferSoRef && invoiceNo ? (
              <>
                {t("wms.order.invoiceLabel")} <span className="font-mono">{invoiceNo}</span>
                {" · "}
                {t("wms.order.soLabel")} <span className="font-mono">{h.orderNo}</span>
              </>
            ) : (
              <>
                {t("wms.order.soLabel")} <span className="font-mono">{h.orderNo}</span>
              </>
            )}
          </p>
          {h.packageCode !== "—" && pk.pkNo === "—" ? (
            <p className="mt-1 text-xs text-slate-600">
              {t("wms.order.packageCode", { label: h.packageCodeLabel })}{" "}
              <span className="font-mono font-semibold">{h.packageCode}</span>
            </p>
          ) : null}
          {h.internalCodeHistory.length > 0 ? (
            <p className="mt-1 text-[10px] text-slate-500">
              {t("wms.order.internalHistory")} {h.internalCodeHistory.join(", ")}
            </p>
          ) : null}
          <p
            className={`mt-1 text-[10px] font-medium ${mode === "active" ? wmsStageWaitToneClass(waitMin) : "text-slate-600"}`}
          >
            {waitLine}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ui.cls}`}>
          {getWmsStageLabel(t, stage)}
        </span>
      </div>
      <dl className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          <span className="text-slate-400">{t("wms.order.warehouse")}</span> {h.warehouseName}
        </div>
        <div>
          <span className="text-slate-400">{t("wms.order.customer")}</span> {h.customerName}
        </div>
        <div>
          <span className="text-slate-400">{t("wms.order.courier")}</span> {h.courier}
        </div>
        <div className="sm:col-span-2">
          <span className="text-slate-400">{t("wms.order.address")}</span> {h.recipientAddress}
        </div>
      </dl>
    </div>
  );
}
