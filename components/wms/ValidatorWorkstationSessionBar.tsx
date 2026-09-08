"use client";

import { Monitor, LogOut, Scan, Link2, Smartphone } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import {
  type ValidatorWorkstationSessionApi,
  useValidatorWorkstationSession,
  validatorUserName,
} from "@/lib/wms/use-validator-workstation-session";
import type { WmsWorkstation } from "@/lib/wms/workstations";

export function ValidatorWorkstationSessionBar({
  api,
}: {
  api: ValidatorWorkstationSessionApi;
}) {
  const { t } = useLocale();
  const {
    session,
    loading,
    busy,
    localError,
    deskConfig,
    scanInput,
    setScanInput,
    doCheckIn,
    doBind,
    doCheckOut,
  } = api;

  const userName = validatorUserName();

  if (loading) {
    return <p className="text-xs text-slate-500">{t("wms.workstation.loading")}</p>;
  }

  const ready = session && !session.needsBind;

  if (!ready) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
          <Monitor className="h-4 w-4" />
          {t("wms.workstation.scanTitle")}
        </p>
        <p className="mt-1 text-xs text-amber-900">{t("wms.workstation.scanHint", { user: userName })}</p>
        <p className="mt-1 text-[10px] text-amber-800">{t("wms.workstation.idleHint")}</p>
        {deskConfig && !deskConfig.checkInEnabled ? (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-800">
            {t("wms.workstation.desksLockedHint")}
          </p>
        ) : null}
        {session?.needsBind ? (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
            {t("wms.workstation.bindHint", { code: session.workstation.code })}
            <button
              type="button"
              disabled={busy}
              onClick={() => void doBind()}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              <Link2 className="h-3.5 w-3.5" />
              {t("wms.workstation.bindButton")}
            </button>
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-sm"
            placeholder={t("wms.workstation.deskPlaceholder")}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void doCheckIn(scanInput)}
            disabled={busy}
            autoFocus
          />
          <button
            type="button"
            disabled={busy || !scanInput.trim()}
            onClick={() => void doCheckIn(scanInput)}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <Scan className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-amber-800">
          <Smartphone className="h-3 w-3" />
          {t("wms.workstation.mobileHint")}
        </p>
        {deskConfig?.desks?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {deskConfig.desks.map((d) => (
              <button
                key={d.code}
                type="button"
                disabled={busy || d.locked || !deskConfig.checkInEnabled}
                title={d.locked ? t("wms.workstation.deskLocked") : `QR: ${d.qr_payload}`}
                onClick={() => void doCheckIn(d.code)}
                className={
                  "rounded-lg border px-2.5 py-1.5 text-xs font-semibold " +
                  (d.locked
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-amber-300 bg-white text-amber-950 hover:border-indigo-400 hover:bg-indigo-50")
                }
              >
                {d.code}
                {d.locked ? " 🔒" : ""}
              </button>
            ))}
          </div>
        ) : null}
        {localError ? <p className="mt-2 text-xs text-red-700">{localError}</p> : null}
        <details className="mt-3 text-[10px] text-amber-800">
          <summary className="cursor-pointer font-medium">{t("wms.workstation.qrPayloadSummary")}</summary>
          <ul className="mt-1 space-y-0.5 font-mono">
            {(deskConfig?.desks ?? []).map((w) => (
              <li key={w.code} className={w.locked ? "text-slate-400" : ""}>
                {w.code}: {w.qr_payload}
                {w.locked ? ` ${t("wms.workstation.lockedSuffix")}` : ""}
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }

  const ws = session.workstation;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm">
      <div>
        <p className="font-semibold text-emerald-950">
          {t("wms.workstation.sessionUser", { user: userName, code: ws.code })}
        </p>
        <p className="text-xs text-emerald-800">
          {ws.location} · {t("wms.workstation.cctv", { cctv: ws.cctv })}
          {session.channel === "mobile" ? t("wms.workstation.viaMobile") : ""}
        </p>
        <p className="mt-0.5 text-[10px] text-emerald-700">{t("wms.workstation.idleHint")}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void doCheckOut()}
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
      >
        <LogOut className="h-3.5 w-3.5" />
        {t("wms.workstation.checkout")}
      </button>
    </div>
  );
}

/** @deprecated Gunakan ValidatorWorkstationSessionBar */
export function ValidatorWorkstationPanel(props: {
  onWorkstationChange?: (ws: WmsWorkstation | null) => void;
}) {
  const api = useValidatorWorkstationSession();
  return <ValidatorWorkstationSessionBar api={api} />;
}
