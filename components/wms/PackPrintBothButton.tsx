"use client";

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { printAwbAndInvoiceAccess } from "@/lib/wms/print-pack-labels";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  salesOrderId: string;
  orderNo?: string;
};

/** Satu klik: AWB → printer termal label, QR invoice → printer slip terpisah. */
export function PackPrintBothButton({ salesOrderId, orderNo }: Props) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await printAwbAndInvoiceAccess({ salesOrderId, orderNo });
      const parts: string[] = [];
      if (res.awbOk) parts.push(t("wms.validasi.packPrintAwbOk"));
      if (res.invoiceOk) parts.push(t("wms.validasi.packPrintInvOk"));
      const errors = [res.awbError, res.invoiceError].filter(Boolean);
      if (parts.length) setMsg(parts.join(" · "));
      if (errors.length) setErr(errors.join(" · "));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/80 p-3">
      <p className="text-xs font-semibold text-indigo-950">{t("wms.validasi.packPrintBothTitle")}</p>
      <p className="mt-0.5 text-[11px] text-indigo-800">{t("wms.validasi.packPrintBothHint")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="mt-2 inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        {t("wms.validasi.packPrintBothBtn")}
      </button>
      {msg ? <p className="mt-1.5 text-[11px] font-medium text-emerald-800">{msg}</p> : null}
      {err ? <p className="mt-1.5 text-[11px] font-medium text-red-700">{err}</p> : null}
    </div>
  );
}
