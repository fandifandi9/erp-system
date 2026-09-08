"use client";

import type { ValidateOrderContext } from "@/lib/wms/validate-order-context";
import { useLocale } from "@/components/LocaleProvider";

export function ValidateOrderSummary({ ctx }: { ctx: ValidateOrderContext }) {
  const { t } = useLocale();

  const pkSub =
    ctx.pkNo !== "—"
      ? t("wms.validasi.summaryPickingKit")
      : ctx.packageCodeType === "awb"
        ? t("wms.validasi.summaryAwb")
        : t("wms.validasi.summaryInternal");

  const cells = [
    { label: t("wms.validasi.summaryOrder"), value: ctx.orderNo, mono: true },
    { label: t("wms.validasi.summaryCustomer"), value: ctx.customerName },
    {
      label: t("wms.validasi.summaryPk"),
      value: ctx.pkNo !== "—" ? ctx.pkNo : ctx.packageCode,
      mono: true,
      sub: pkSub,
    },
    { label: t("wms.validasi.summaryWarehouse"), value: ctx.warehouseName },
    { label: t("wms.validasi.summaryCourier"), value: ctx.courier },
    { label: t("wms.validasi.summaryMarketplace"), value: ctx.marketplace },
  ];

  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{c.label}</p>
          <p className={`truncate text-sm font-semibold text-slate-900 ${c.mono ? "font-mono" : ""}`}>
            {c.value}
          </p>
          {c.sub ? <p className="text-[10px] text-indigo-600">{c.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}
