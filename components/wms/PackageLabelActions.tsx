"use client";

import { useState } from "react";
import { Loader2, Printer, QrCode } from "lucide-react";
import { getPkIdentityView } from "@/lib/wms/pk-identity";
import { pkCodeBody } from "@/lib/wms/pk-number";
import { printPkForSalesOrder } from "@/lib/wms/print-pk-for-order";
import { getErrorMessage } from "@/lib/errors";
import type { SalesOrder } from "@/lib/bisnis/types";
import { useLocale } from "@/components/LocaleProvider";

/** Cetak slip PK ke printer kasir/termal 80mm. */
export function PackageLabelActions({
  so,
  assigning = false,
  autoPrintEnabled = false,
}: {
  so: SalesOrder;
  assigning?: boolean;
  autoPrintEnabled?: boolean;
}) {
  const { t } = useLocale();
  const [printing, setPrinting] = useState(false);
  const pk = getPkIdentityView(so);

  const handlePrint = async () => {
    if (!pk.pkNo || pk.pkNo === "—") return;
    setPrinting(true);
    try {
      await printPkForSalesOrder(so);
    } catch (e) {
      alert(getErrorMessage(e, t("wms.pkLabel.errPrint")));
    } finally {
      setPrinting(false);
    }
  };

  if (assigning) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-violet-800">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("wms.pkLabel.creating")}
      </p>
    );
  }
  if (!pk.pkNo || pk.pkNo === "—") {
    return (
      <p className="text-xs text-amber-800">{t("wms.pkLabel.notAvailable")}</p>
    );
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-sm">
      <p className="font-semibold text-violet-950">{t("wms.pkLabel.title")}</p>
      <p className="mt-1 flex items-baseline gap-1.5 font-mono text-2xl font-bold tracking-wide text-indigo-700">
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">PK</span>
        <span>{pkCodeBody(pk.pkNo)}</span>
      </p>
      <p className="text-xs text-violet-800">
        {autoPrintEnabled ? t("wms.pkLabel.autoPrintHint") : t("wms.pkLabel.manualPrintHint")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handlePrint()}
          disabled={printing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {printing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Printer className="h-3.5 w-3.5" />
          )}
          {t("wms.pkLabel.printBtn")}
        </button>
        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
          <QrCode className="h-3.5 w-3.5" />
          <span className="font-mono">{pk.qrPayload}</span>
        </span>
      </div>
    </div>
  );
}
