"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Settings } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { WmsPrimaryButton, WmsSectionTitle } from "@/components/wms/ui";
import { PkPrinterSettings } from "@/components/wms/PkPrinterSettings";
import {
  getAutoPrintPkEnabled,
  setAutoPrintPkEnabled,
} from "@/lib/wms/picking-preferences";

type EntryMode = "manual" | "tracking_scan";

type PickingModeApi = {
  entryMode: EntryMode;
  setEntryMode: (m: EntryMode) => void;
  autoPrintPk: boolean;
  setAutoPrintPk: (v: boolean) => void;
  trackScan: string;
  setTrackScan: (v: string) => void;
  registerFindSo: (fn: ((code: string) => void | Promise<void>) | null) => void;
  findSo: (code: string) => void;
};

const PickingModeContext = createContext<PickingModeApi | null>(null);

export function PickingModeProvider({ children }: { children: ReactNode }) {
  const [entryMode, setEntryMode] = useState<EntryMode>("manual");
  const [autoPrintPk, setAutoPrintPkState] = useState(false);
  const [trackScan, setTrackScan] = useState("");
  const findSoRef = useRef<((code: string) => void | Promise<void>) | null>(null);

  useEffect(() => {
    setAutoPrintPkState(getAutoPrintPkEnabled());
  }, []);

  const setAutoPrintPk = useCallback((v: boolean) => {
    setAutoPrintPkState(v);
    setAutoPrintPkEnabled(v);
  }, []);

  const registerFindSo = useCallback((fn: ((code: string) => void | Promise<void>) | null) => {
    findSoRef.current = fn;
  }, []);

  const findSo = useCallback((code: string) => {
    void findSoRef.current?.(code);
  }, []);

  const value = useMemo(
    () => ({
      entryMode,
      setEntryMode,
      autoPrintPk,
      setAutoPrintPk,
      trackScan,
      setTrackScan,
      registerFindSo,
      findSo,
    }),
    [entryMode, autoPrintPk, trackScan, setAutoPrintPk, registerFindSo, findSo],
  );

  return <PickingModeContext.Provider value={value}>{children}</PickingModeContext.Provider>;
}

export function usePickingModeApi(): PickingModeApi {
  const ctx = useContext(PickingModeContext);
  if (!ctx) throw new Error("usePickingModeApi must be used within PickingModeProvider");
  return ctx;
}

export function useOptionalPickingModeApi(): PickingModeApi | null {
  return useContext(PickingModeContext);
}

/** Tombol Mode + panel — untuk bar tab (di atas garis). */
export function PickingModeToolbar() {
  const { t } = useLocale();
  const api = useOptionalPickingModeApi();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-picking-mode-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!api) return null;

  const {
    entryMode,
    setEntryMode,
    autoPrintPk,
    setAutoPrintPk,
    trackScan,
    setTrackScan,
    findSo,
  } = api;

  return (
    <div className="relative flex shrink-0 items-center" data-picking-mode-panel>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition " +
          (open
            ? "border-indigo-300 bg-indigo-50 text-indigo-800"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
        }
        aria-expanded={open}
      >
        <Settings className="h-4 w-4" />
        {t("wms.picking.modeTitle")}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <WmsSectionTitle title={t("wms.picking.modeTitle")} subtitle={t("wms.picking.modeSubtitle")} />
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-800">{t("wms.picking.autoPrintPk")}</p>
              <p className="text-[10px] text-slate-500">
                {autoPrintPk ? t("wms.picking.autoPrintOn") : t("wms.picking.autoPrintOff")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoPrintPk}
              onClick={() => setAutoPrintPk(!autoPrintPk)}
              className={
                "relative h-7 w-12 shrink-0 rounded-full transition " +
                (autoPrintPk ? "bg-indigo-600" : "bg-slate-300")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition " +
                  (autoPrintPk ? "left-5" : "left-0.5")
                }
              />
            </button>
          </label>
          <PkPrinterSettings />
          <div className="mt-2 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setEntryMode("manual")}
              className={`rounded-lg px-3 py-1.5 font-medium ${entryMode === "manual" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
            >
              {t("wms.picking.manualMode")}
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("tracking_scan")}
              className={`rounded-lg px-3 py-1.5 font-medium ${entryMode === "tracking_scan" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
            >
              {t("wms.picking.scanMode")}
            </button>
          </div>
          {entryMode === "tracking_scan" ? (
            <div className="mt-3 flex gap-2">
              <input
                data-track-input
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                placeholder={t("wms.picking.scanPkOrderPlaceholder")}
                value={trackScan}
                onChange={(e) => setTrackScan(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && findSo(trackScan)}
              />
              <WmsPrimaryButton type="button" onClick={() => findSo(trackScan)}>
                {t("wms.picking.findSo")}
              </WmsPrimaryButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
