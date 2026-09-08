"use client";

import { getInvoiceListDisplay } from "@/lib/bisnis/invoice-list-display";
import type { Invoice, SalesOrder } from "@/lib/bisnis/types";
import { isWmsPickupFulfillment } from "@/lib/wms/fulfillment-mode";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { getPkFromSo } from "@/lib/wms/pk-identity";
import { pkCodeBody } from "@/lib/wms/pk-number";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  invoice: Invoice;
  salesOrder?: SalesOrder | null;
  compact?: boolean;
};

export function InvoiceListMetaBadges({ invoice, salesOrder, compact }: Props) {
  const { t } = useLocale();
  const meta = getInvoiceListDisplay(invoice, salesOrder);
  const pill = compact
    ? "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
    : "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset";

  const pickup = salesOrder && isWmsPickupFulfillment(salesOrder);
  const pkRaw = salesOrder ? getPkFromSo(salesOrder) : null;
  const pkNo = pkRaw ? pkCodeBody(pkRaw) : null;
  const sendCount = salesOrder
    ? parseOutboundWorkflow(salesOrder.outbound_workflow_json).pk_email?.send_count ?? 0
    : 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`${pill} bg-slate-100 text-slate-700 ring-slate-200`}>{meta.channelLabel}</span>
      <span className={`${pill} ${meta.badgeCls}`}>{meta.badgeLabel}</span>
      {pickup ? (
        <>
          <span className={`${pill} bg-violet-50 text-violet-900 ring-violet-200`}>
            {t("sales.wmsStage.modePickup")}
          </span>
          {pkNo ? (
            <span className={`${pill} bg-indigo-50 font-mono text-indigo-900 ring-indigo-200`}>
              {t("sales.wmsStage.pkNo", { pk: pkNo })}
            </span>
          ) : null}
          <span
            className={
              `${pill} ` +
              (sendCount > 0
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : "bg-amber-50 text-amber-900 ring-amber-200")
            }
            title={
              sendCount > 0
                ? t("sales.wmsStage.pkEmailSentTip", { count: String(sendCount) })
                : t("sales.wmsStage.pkEmailPendingTip")
            }
          >
            {sendCount > 0
              ? t("sales.wmsStage.pkEmailSent", { count: String(sendCount) })
              : t("sales.wmsStage.pkEmailPending")}
          </span>
        </>
      ) : null}
    </span>
  );
}
