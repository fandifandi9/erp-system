"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { WmsCard, WmsSectionTitle } from "@/components/wms/ui";
import { OutboundFlowBar } from "@/components/wms/OutboundFlowBar";
import { OutboundOrderQueue } from "@/components/wms/OutboundOrderQueue";
import { WmsOrderHeader } from "@/components/wms/WmsOrderHeader";
import type { SalesOrder } from "@/lib/bisnis/types";
import { loadCompleteQueue } from "@/lib/wms/outbound-queues";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { fetchOutboundAuditForSo } from "@/lib/wms/outbound-audit";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";

export default function WmsSelesaiPage() {
  const { t, locale } = useLocale();
  const [queue, setQueue] = useState<SalesOrder[]>([]);
  const [selected, setSelected] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dateLocale = locale === "en" ? "en-US" : "id-ID";

  const fmtTime = (iso?: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(dateLocale);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setQueue(await loadCompleteQueue());
    } catch (e) {
      setError(getErrorMessage(e));
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const wf = selected ? parseOutboundWorkflow(selected.outbound_workflow_json) : null;

  useEffect(() => {
    if (!selected) return;
    void fetchOutboundAuditForSo(selected.id);
  }, [selected?.id]);

  const auditRows = selected && wf
    ? [
        { label: t("wms.selesai.auditPickingStart"), value: fmtTime(wf.pick?.started_at), who: wf.pick?.user_name },
        { label: t("wms.selesai.auditPickingDone"), value: fmtTime(wf.pick?.completed_at), who: wf.pick?.user_name },
        {
          label: t("wms.selesai.auditValidatePack"),
          value: fmtTime(wf.validate_pack?.at ?? wf.validate?.at),
          who: wf.validate_pack?.user_name,
          extra: wf.validate_pack?.workstation_code
            ? `${wf.validate_pack.workstation_code}${wf.validate_pack.workstation_cctv ? ` · CCTV ${wf.validate_pack.workstation_cctv}` : ""}`
            : undefined,
        },
        {
          label: t("wms.selesai.auditReadyPickup"),
          value: wf.stage === "completed" || wf.pickup ? fmtTime(wf.validate_pack?.at) : "—",
          who: undefined,
        },
        {
          label: t("wms.selesai.auditHandover"),
          value: fmtTime(wf.pickup?.at),
          who: wf.pickup?.driver_name,
          extra: [
            wf.pickup?.driver_phone,
            wf.pickup?.courier_company,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        },
        { label: t("wms.selesai.auditCompleted"), value: fmtTime(wf.pickup?.at), who: wf.pickup?.user_name },
      ]
    : [];

  const yn = (v: boolean | undefined) => (v ? t("wms.selesai.yes") : t("wms.selesai.no"));

  return (
    <>
        <OutboundFlowBar stage="completed" />

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <OutboundOrderQueue
              title={t("wms.selesai.doneListTitle")}
              subtitle={t("wms.selesai.doneListSubtitle")}
              orders={queue}
              selectedId={selected?.id}
              loading={loading}
              emptyText={t("wms.selesai.empty")}
              timeMode="history"
              onSelect={setSelected}
            />
          </div>

          <div className="lg:col-span-2 space-y-4">
            {!selected ? (
              <WmsCard className="py-12 text-center text-sm text-slate-500">
                {t("wms.selesai.selectOrder")}
              </WmsCard>
            ) : (
              <>
                <WmsOrderHeader so={selected} timeMode="history" />
                <WmsCard>
                  <WmsSectionTitle title={t("wms.selesai.historyTitle")} subtitle={t("wms.selesai.historySubtitle")} />
                  <ul className="mt-4 space-y-3">
                    {auditRows.map((row) => (
                      <li
                        key={row.label}
                        className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm"
                      >
                        <p className="font-medium text-slate-800">{row.label}</p>
                        <p className="text-slate-600">{row.value}</p>
                        {row.who ? <p className="text-xs text-slate-500">{t("wms.selesai.byUser", { who: row.who })}</p> : null}
                        {row.extra ? <p className="text-xs text-slate-500">{row.extra}</p> : null}
                      </li>
                    ))}
                  </ul>
                  {wf?.validation_fail_reason ? (
                    <p className="mt-3 text-xs text-orange-800">
                      {t("wms.selesai.validationFailNote", { reason: wf.validation_fail_reason })}
                    </p>
                  ) : null}
                  {wf?.cancel_reason ? (
                    <p className="mt-1 text-xs text-red-700">
                      {t("wms.selesai.cancelNote", { reason: wf.cancel_reason })}
                    </p>
                  ) : null}
                </WmsCard>
                {wf?.pickup?.physical_checks ? (
                  <WmsCard>
                    <WmsSectionTitle title={t("wms.selesai.physicalTitle")} subtitle={t("wms.selesai.physicalSubtitle")} />
                    <ul className="mt-2 text-sm text-slate-700">
                      <li>
                        {t("wms.selesai.physicalScan")}{" "}
                        <span className="font-mono">{wf.pickup.physical_scan_code ?? "—"}</span>
                      </li>
                      <li>
                        {t("wms.selesai.physicalPackageOk")}{" "}
                        {yn(wf.pickup.physical_checks.package_count_ok)}
                      </li>
                      <li>
                        {t("wms.selesai.physicalLabelOk")}{" "}
                        {yn(wf.pickup.physical_checks.label_readable)}
                      </li>
                      <li>
                        {t("wms.selesai.physicalSealOk")}{" "}
                        {yn(wf.pickup.physical_checks.seal_intact)}
                      </li>
                      <li>
                        {t("wms.selesai.physicalVerifiedAt")}{" "}
                        {wf.pickup.physical_verified_at
                          ? new Date(wf.pickup.physical_verified_at).toLocaleString(dateLocale)
                          : "—"}
                      </li>
                    </ul>
                  </WmsCard>
                ) : null}
                <Link
                  href={`/wms/pickup/tanda-terima/${selected.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline"
                >
                  <Printer className="h-4 w-4" />
                  {t("wms.selesai.reprintReceipt")}
                </Link>
                <p className="text-xs text-slate-500">{t("wms.selesai.auditImmutable")}</p>
              </>
            )}
          </div>
        </div>

    </>
  );
}
