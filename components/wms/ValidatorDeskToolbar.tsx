"use client";

import { useEffect, useState } from "react";
import { LogOut, Monitor } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { ValidatorWorkstationSessionBar } from "@/components/wms/ValidatorWorkstationSessionBar";
import { PackPrinterSettings } from "@/components/wms/PackPrinterSettings";
import { useOptionalValidatorWorkstationApi } from "@/components/wms/ValidatorWorkstationProvider";

/** Tombol meja + printer — untuk bar tab (di atas garis). */
export function ValidatorDeskToolbar() {
  const { t } = useLocale();
  const deskApi = useOptionalValidatorWorkstationApi();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-desk-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!deskApi) return null;

  const { sessionReady, workstation, busy } = deskApi;

  return (
    <div className="relative flex shrink-0 items-center gap-1.5" data-desk-panel>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition " +
          (sessionReady
            ? open
              ? "border-emerald-400 bg-emerald-50 text-emerald-900"
              : "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
            : open
              ? "border-amber-400 bg-amber-50 text-amber-950"
              : "border-amber-300 bg-white text-amber-900 hover:bg-amber-50")
        }
        aria-expanded={open}
      >
        <Monitor className="h-4 w-4" />
        {sessionReady && workstation ? workstation.code : t("wms.validasi.deskPanelBtn")}
      </button>
      {sessionReady ? (
        <button
          type="button"
          disabled={busy}
          title={t("wms.workstation.checkout")}
          onClick={() => void deskApi.doCheckOut()}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1.5 max-h-[min(80dvh,36rem)] w-[min(100vw-2rem,24rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <ValidatorWorkstationSessionBar api={deskApi} />
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {t("wms.validasi.packPrintSetupOnce")}
            </p>
            <PackPrinterSettings />
          </div>
        </div>
      ) : null}
    </div>
  );
}
