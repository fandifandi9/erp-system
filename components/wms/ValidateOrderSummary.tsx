"use client";

import type { ValidateOrderContext } from "@/lib/wms/validate-order-context";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  ctx: ValidateOrderContext;
  /** Ringkas: satu baris info penting, bukan grid besar. */
  compact?: boolean;
};

export function ValidateOrderSummary({ ctx, compact }: Props) {
  const { t } = useLocale();

  const pkValue = ctx.pkNo !== "—" ? ctx.pkNo : ctx.packageCode;

  if (compact) {
    const bits = [
      ctx.orderNo,
      ctx.customerName,
      pkValue !== "—" ? `PK ${pkValue}` : null,
      ctx.storeName !== "—" ? ctx.storeName : null,
      [ctx.courier, ctx.shippingService].filter((x) => x && x !== "—").join(" · ") || null,
      ctx.marketplace !== "—" ? ctx.marketplace : null,
      ctx.shippingCost !== "—" ? ctx.shippingCost : null,
    ].filter(Boolean) as string[];

    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-slate-700">
          {bits.map((b, i) => (
            <span key={`${b}-${i}`} className={i === 0 ? "font-mono font-semibold text-slate-900" : undefined}>
              {i > 0 ? <span className="mr-2 text-slate-300">·</span> : null}
              {b}
            </span>
          ))}
        </div>
        {ctx.recipientAddress && ctx.recipientAddress !== "—" ? (
          <p className="mt-1 truncate text-[11px] text-slate-500">{ctx.recipientAddress}</p>
        ) : null}
      </div>
    );
  }

  const pkSub =
    ctx.pkNo !== "—"
      ? t("wms.validasi.summaryPickingKit")
      : ctx.packageCodeType === "awb"
        ? t("wms.validasi.summaryAwb")
        : t("wms.validasi.summaryInternal");

  const cells: Array<{
    label: string;
    value: string;
    mono?: boolean;
    sub?: string;
    wide?: boolean;
  }> = [
    { label: t("wms.validasi.summaryOrder"), value: ctx.orderNo, mono: true },
    { label: t("wms.validasi.summaryCustomer"), value: ctx.customerName },
    {
      label: t("wms.validasi.summaryPk"),
      value: pkValue,
      mono: true,
      sub: pkSub,
    },
    { label: t("wms.validasi.summaryStore"), value: ctx.storeName },
    { label: t("wms.validasi.summaryCourier"), value: ctx.courier },
    { label: t("wms.validasi.summaryService"), value: ctx.shippingService },
    { label: t("wms.validasi.summaryAddress"), value: ctx.recipientAddress, wide: true },
    { label: t("wms.validasi.summaryShippingCost"), value: ctx.shippingCost },
    { label: t("wms.validasi.summaryMarketplace"), value: ctx.marketplace },
  ];

  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className={"min-w-0 " + (c.wide ? "sm:col-span-2 lg:col-span-3" : "")}>
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
