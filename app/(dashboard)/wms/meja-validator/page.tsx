"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Printer, QrCode, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { WmsCard, WmsPrimaryButton, WmsSectionTitle } from "@/components/wms/ui";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";
import { buildWorkstationQrPayload } from "@/lib/wms/workstation-qr";
import { printHtmlViaIframe } from "@/lib/wms/print-pk-receipt";

type DeskRow = {
  id: string;
  code: string;
  name: string;
  location: string;
  cctv: string;
  qr_payload: string;
  locked?: boolean;
  active?: boolean;
};

export default function WmsMejaValidatorPage() {
  const { t } = useLocale();
  const [desks, setDesks] = useState<DeskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [cctv, setCctv] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/wms/workstations/config", { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { desks?: DeskRow[] };
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Gagal memuat meja");
      const list = (json.data?.desks ?? []).map((d) => ({
        ...d,
        id: d.id || d.code,
        qr_payload: d.qr_payload || buildWorkstationQrPayload(d.code),
      }));
      setDesks(list);

      const next: Record<string, string> = {};
      await Promise.all(
        list.map(async (d) => {
          next[d.code] = await QRCode.toDataURL(d.qr_payload, {
            margin: 1,
            width: 280,
            errorCorrectionLevel: "M",
          });
        }),
      );
      setQrMap(next);
    } catch (e) {
      setError(getErrorMessage(e));
      setDesks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createDesk = async () => {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/wms/workstations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          location,
          cctv,
          is_active: true,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Gagal membuat meja");
      setCode("");
      setName("");
      setLocation("");
      setCctv("");
      setInfo(t("wms.meja.createdOk"));
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const printDeskQr = async (d: DeskRow) => {
    const dataUrl =
      qrMap[d.code] ||
      (await QRCode.toDataURL(d.qr_payload, { margin: 1, width: 400, errorCorrectionLevel: "M" }));
    const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><title>QR ${d.code}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 8mm; text-align: center; color: #000; }
  h1 { font-size: 16pt; margin: 0 0 2mm; }
  .sub { font-size: 10pt; margin: 0 0 4mm; color: #333; }
  img { width: 55mm; height: 55mm; }
  .code { font-family: Consolas, monospace; font-size: 14pt; font-weight: 700; margin-top: 3mm; }
  .payload { font-size: 8pt; word-break: break-all; margin-top: 2mm; color: #444; }
  @media print { @page { size: 80mm 100mm; margin: 4mm; } }
</style></head><body>
  <h1>MEJA VALIDATOR</h1>
  <p class="sub">${escapeHtml(d.name)}</p>
  <img src="${dataUrl}" alt="QR ${escapeHtml(d.code)}" />
  <p class="code">${escapeHtml(d.code)}</p>
  <p class="sub">${escapeHtml(d.location)}${d.cctv && d.cctv !== "—" ? ` · ${escapeHtml(d.cctv)}` : ""}</p>
  <p class="payload">${escapeHtml(d.qr_payload)}</p>
</body></html>`;
    await printHtmlViaIframe(html);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <WmsSectionTitle title={t("wms.meja.title")} subtitle={t("wms.meja.subtitle")} />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {info}
        </div>
      ) : null}

      <WmsCard>
        <WmsSectionTitle title={t("wms.meja.createTitle")} subtitle={t("wms.meja.createHint")} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            {t("wms.meja.code")} <span className="text-red-500">*</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="VALIDATOR-04"
            />
          </label>
          <label className="block text-sm">
            {t("wms.meja.name")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meja Validator 04"
            />
          </label>
          <label className="block text-sm">
            {t("wms.meja.location")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Gudang — zona packing A"
            />
          </label>
          <label className="block text-sm">
            {t("wms.meja.cctv")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={cctv}
              onChange={(e) => setCctv(e.target.value)}
              placeholder="CCTV-V04"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <WmsPrimaryButton disabled={saving || !code.trim()} onClick={() => void createDesk()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t("wms.meja.createBtn")}
          </WmsPrimaryButton>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onClick={() => void load()}
          >
            <RefreshCw className="h-4 w-4" />
            {t("wms.meja.refresh")}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">{t("wms.meja.pbHint")}</p>
      </WmsCard>

      <WmsCard>
        <WmsSectionTitle title={t("wms.meja.listTitle")} subtitle={t("wms.meja.listHint")} />
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : desks.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">{t("wms.meja.empty")}</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {desks.map((d) => (
              <li
                key={d.id || d.code}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-lg font-bold text-indigo-800">{d.code}</p>
                    <p className="text-sm text-slate-800">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.location}</p>
                    {d.cctv && d.cctv !== "—" ? (
                      <p className="text-[11px] text-slate-500">{d.cctv}</p>
                    ) : null}
                  </div>
                  <QrCode className="h-5 w-5 shrink-0 text-slate-400" />
                </div>
                {qrMap[d.code] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrMap[d.code]}
                    alt={`QR ${d.code}`}
                    className="mx-auto mt-3 h-40 w-40 rounded-lg border border-slate-100 bg-white p-2"
                  />
                ) : (
                  <div className="mx-auto mt-3 flex h-40 w-40 items-center justify-center rounded-lg bg-slate-50">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                )}
                <p className="mt-2 break-all text-center font-mono text-[10px] text-slate-500">
                  {d.qr_payload}
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                  onClick={() => void printDeskQr(d)}
                >
                  <Printer className="h-4 w-4" />
                  {t("wms.meja.printQr")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </WmsCard>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
