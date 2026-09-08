"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import type { SalesOrder } from "@/lib/bisnis/types";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { getPkFromSo } from "@/lib/wms/pk-identity";
import { pkCodeBody } from "@/lib/wms/pk-number";
import { isWmsPickupFulfillment } from "@/lib/wms/fulfillment-mode";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";
import { fetchSalesOrder } from "@/lib/bisnis/client";

type Props = {
  salesOrder: Pick<
    SalesOrder,
    "id" | "notes" | "pk_no" | "outbound_workflow_json" | "send_to_warehouse_at"
  >;
  onUpdated?: (so: SalesOrder) => void;
};

/** Status PK + email pelanggan (mode ambil sendiri) + tombol kirim ulang. */
export function PkEmailStatusPanel({ salesOrder, onUpdated }: Props) {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [localSo, setLocalSo] = useState(salesOrder);

  useEffect(() => {
    setLocalSo(salesOrder);
  }, [salesOrder]);

  const pkRaw = getPkFromSo(localSo);
  const pkNo = pkRaw ? pkCodeBody(pkRaw) : null;
  const sendCount =
    parseOutboundWorkflow(localSo.outbound_workflow_json).pk_email?.send_count ?? 0;

  const resend = useCallback(async () => {
    if (!pkNo) {
      setError(t("sales.pkEmail.errNoPk"));
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/bisnis/sales-orders/${localSo.id}/pk-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ forceResend: true }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        reason?: string;
        sent?: boolean;
        send_count?: number;
      };
      if (!res.ok || (!json.ok && !json.sent)) {
        throw new Error(json.error ?? json.reason ?? t("sales.pkEmail.errSend"));
      }
      const fresh = await fetchSalesOrder(localSo.id);
      setLocalSo(fresh);
      onUpdated?.(fresh);
      setInfo(
        t("sales.pkEmail.sentOk", {
          count: String(json.send_count ?? sendCount + 1),
        }),
      );
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [localSo.id, pkNo, onUpdated, sendCount, t]);

  if (!isWmsPickupFulfillment(localSo)) return null;
  if (!localSo.send_to_warehouse_at && !pkNo) return null;

  const wf = parseOutboundWorkflow(localSo.outbound_workflow_json);
  const lastSent = wf.pk_email?.last_sent_at;
  const lastTo = wf.pk_email?.last_to;
  const lastError = wf.pk_email?.last_error;
  const dateLocale = locale === "en" ? "en-US" : "id-ID";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm">
      <p className="font-semibold text-violet-950">{t("sales.pkEmail.title")}</p>
      <p className="mt-0.5 text-xs text-violet-800">{t("sales.pkEmail.subtitle")}</p>
      <dl className="mt-3 grid gap-1.5 text-xs text-slate-700 sm:grid-cols-2">
        <div>
          <span className="text-slate-500">{t("sales.pkEmail.pkStatus")}: </span>
          {pkNo ? (
            <span className="font-mono font-semibold text-indigo-800">{pkNo}</span>
          ) : (
            <span className="text-amber-800">{t("sales.pkEmail.pkPending")}</span>
          )}
        </div>
        <div>
          <span className="text-slate-500">{t("sales.pkEmail.emailStatus")}: </span>
          {sendCount > 0 ? (
            <span className="font-medium text-emerald-800">{t("sales.pkEmail.emailSent")}</span>
          ) : (
            <span className="text-amber-800">{t("sales.pkEmail.emailNotSent")}</span>
          )}
        </div>
        <div>
          <span className="text-slate-500">{t("sales.pkEmail.sendCount")}: </span>
          <span className="font-semibold">{sendCount}</span>
        </div>
        {lastSent ? (
          <div>
            <span className="text-slate-500">{t("sales.pkEmail.lastSent")}: </span>
            {new Date(lastSent).toLocaleString(dateLocale)}
            {lastTo ? <span className="text-slate-500"> · {lastTo}</span> : null}
          </div>
        ) : null}
      </dl>
      {lastError ? (
        <p className="mt-2 text-xs text-red-700">
          {t("sales.pkEmail.lastError")}: {lastError}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {info ? <p className="mt-2 text-xs text-emerald-800">{info}</p> : null}
      <button
        type="button"
        disabled={busy || !pkNo}
        onClick={() => void resend()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        {t("sales.pkEmail.resendBtn")}
      </button>
    </div>
  );
}
