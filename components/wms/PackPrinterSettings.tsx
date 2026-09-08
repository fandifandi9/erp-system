"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  getAwbQzPrinterName,
  getHandoverQzPrinterName,
  getInvoiceQrQzPrinterName,
  getPackPrintMode,
  setAwbQzPrinterName,
  setHandoverQzPrinterName,
  setInvoiceQrQzPrinterName,
  setPackPrintMode,
  type PackPrintMode,
} from "@/lib/wms/pack-print-preferences";
import { ensureQzConnected, listQzPrinters } from "@/lib/wms/qz-print";
import { useLocale } from "@/components/LocaleProvider";

/** Atur printer packing: AWB label + slip termal 80mm (QR invoice & tanda terima). */
export function PackPrinterSettings() {
  const { t } = useLocale();
  const [mode, setMode] = useState<PackPrintMode>("browser");
  const [awbPrinter, setAwbPrinter] = useState("");
  const [invPrinter, setInvPrinter] = useState("");
  const [handoverPrinter, setHandoverPrinter] = useState("");
  const [qzList, setQzList] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setMode(getPackPrintMode());
    setAwbPrinter(getAwbQzPrinterName());
    setInvPrinter(getInvoiceQrQzPrinterName());
    setHandoverPrinter(getHandoverQzPrinterName());
  }, []);

  const loadQz = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await ensureQzConnected();
      setQzList(await listQzPrinters());
      setMsg(t("wms.validasi.packPrintQzOk"));
    } catch {
      setErr(t("wms.validasi.packPrintQzFail"));
    } finally {
      setBusy(false);
    }
  };

  const printerOptions = (selected: string, prefix: string) => (
    <>
      <option value="">{t("wms.validasi.packPrintPickPrinter")}</option>
      {qzList.map((p) => (
        <option key={`${prefix}-${p}`} value={p}>
          {p}
        </option>
      ))}
      {selected && !qzList.includes(selected) ? (
        <option value={selected}>{selected}</option>
      ) : null}
    </>
  );

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
      <p className="font-semibold text-slate-800">{t("wms.validasi.packPrintSettingsTitle")}</p>
      <p className="text-[11px] text-slate-600">{t("wms.validasi.packPrintSettingsHint")}</p>
      <label className="flex flex-col gap-1">
        <span className="text-slate-600">{t("wms.validasi.packPrintMode")}</span>
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1.5"
          value={mode}
          onChange={(e) => {
            const m = e.target.value === "qz" ? "qz" : "browser";
            setMode(m);
            setPackPrintMode(m);
          }}
        >
          <option value="qz">{t("wms.validasi.packPrintModeQz")}</option>
          <option value="browser">{t("wms.validasi.packPrintModeBrowser")}</option>
        </select>
      </label>
      {mode === "qz" ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadQz()}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-white"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("wms.validasi.packPrintLoadQz")}
          </button>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">{t("wms.validasi.packPrintAwbPrinter")}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1.5"
              value={awbPrinter}
              onChange={(e) => {
                setAwbPrinter(e.target.value);
                setAwbQzPrinterName(e.target.value);
              }}
            >
              {printerOptions(awbPrinter, "awb")}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">{t("wms.validasi.packPrintInvPrinter")}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1.5"
              value={invPrinter}
              onChange={(e) => {
                setInvPrinter(e.target.value);
                setInvoiceQrQzPrinterName(e.target.value);
              }}
            >
              {printerOptions(invPrinter, "inv")}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">{t("wms.validasi.packPrintHandoverPrinter")}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1.5"
              value={handoverPrinter}
              onChange={(e) => {
                setHandoverPrinter(e.target.value);
                setHandoverQzPrinterName(e.target.value);
              }}
            >
              {printerOptions(handoverPrinter, "handover")}
            </select>
          </label>
        </>
      ) : null}
      {msg ? <p className="text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-red-700">{err}</p> : null}
    </div>
  );
}
