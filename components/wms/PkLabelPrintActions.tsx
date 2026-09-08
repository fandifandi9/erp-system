"use client";

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import type { SalesOrder } from "@/lib/bisnis/types";
import { getPkFromSo } from "@/lib/wms/pk-identity";
import { pkCodeBody } from "@/lib/wms/pk-number";
import { printPkPickupLabelSmart } from "@/lib/wms/print-pk-pickup-label";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  so: SalesOrder;
  compact?: boolean;
};

/** Cetak label PK (ambil sendiri) — ukuran sama label AWB, printer yang sama. */
export function PkLabelPrintActions({ so, compact }: Props) {
  const { t } = useLocale();
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const pk = getPkFromSo(so);
  const pkNo = pk ? pkCodeBody(pk) : "";

  const printNow = async () => {
    setPrinting(true);
    setError("");
    try {
      await printPkPickupLabelSmart(so.id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setPrinting(false);
    }
  };

  if (!pkNo) {
    return (
      <p className="text-xs text-amber-800">
        {t("wms.validasi.pkLabelMissing")}
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-slate-600">
          {t("wms.validasi.pkLabelTitle")}
          <span className="ml-1 font-mono text-indigo-800">{pkNo}</span>
        </span>
        <button
          type="button"
          disabled={printing}
          onClick={() => void printNow()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          {t("wms.validasi.pkLabelPrint")}
        </button>
      </div>
      <p className="text-[10px] text-slate-500">{t("wms.validasi.pkLabelHint")}</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
