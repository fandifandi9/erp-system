"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer, RefreshCw } from "lucide-react";
import {
  getPkPrintMode,
  setPkPrintMode,
  getPkPrinterName,
  setPkPrinterName,
  getPkNetworkConfig,
  setPkNetworkConfig,
  type PkPrintMode,
} from "@/lib/wms/printer-preferences";
import { ensureQzConnected, listQzPrinters } from "@/lib/wms/qz-print";
import { printPkReceiptsSmart } from "@/lib/wms/print-pk-smart";
import { buildPkQrPayload } from "@/lib/wms/pk-number";

const MODE_LABEL: Record<PkPrintMode, string> = {
  network: "Printer WiFi / Jaringan (langsung, universal)",
  qz: "Printer lokal (QZ Tray)",
  browser: "Dialog cetak browser",
};

export function PkPrinterSettings() {
  const [mode, setMode] = useState<PkPrintMode>("browser");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(9100);
  const [widthMm, setWidthMm] = useState(58);
  const [qzPrinter, setQzPrinter] = useState("");
  const [qzList, setQzList] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMode(getPkPrintMode());
    const net = getPkNetworkConfig();
    setHost(net.host);
    setPort(net.port);
    setWidthMm(net.widthMm);
    setQzPrinter(getPkPrinterName());
  }, []);

  const changeMode = (m: PkPrintMode) => {
    setMode(m);
    setPkPrintMode(m);
    setMsg(null);
    setErr(null);
  };

  const saveNetwork = (patch: Partial<{ host: string; port: number; widthMm: number }>) => {
    if (patch.host !== undefined) setHost(patch.host);
    if (patch.port !== undefined) setPort(patch.port);
    if (patch.widthMm !== undefined) setWidthMm(patch.widthMm);
    setPkNetworkConfig(patch);
  };

  const loadQzPrinters = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await ensureQzConnected();
      const list = await listQzPrinters();
      setQzList(list);
      setMsg("Terhubung ke QZ Tray.");
    } catch {
      setErr("QZ Tray tidak berjalan. Pasang & jalankan aplikasi QZ Tray.");
    } finally {
      setBusy(false);
    }
  };

  const selectQz = (name: string) => {
    setQzPrinter(name);
    setPkPrinterName(name);
  };

  const testPrint = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await printPkReceiptsSmart([
        {
          pkNo: "PKTEST0001",
          qrPayload: buildPkQrPayload("PKTEST0001"),
          orderNo: "TEST-CETAK",
          customerName: "Uji Printer",
          warehouseName: "—",
        },
      ]);
      setMsg("Cetak uji terkirim.");
    } catch {
      setErr("Gagal cetak uji. Cek IP/koneksi printer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Printer className="h-4 w-4 text-slate-500" />
        <p className="text-sm font-medium text-slate-800">Printer slip PK</p>
      </div>

      <select
        value={mode}
        onChange={(e) => changeMode(e.target.value as PkPrintMode)}
        className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
      >
        {(Object.keys(MODE_LABEL) as PkPrintMode[]).map((m) => (
          <option key={m} value={m}>
            {MODE_LABEL[m]}
          </option>
        ))}
      </select>

      {mode === "network" ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              value={host}
              onChange={(e) => saveNetwork({ host: e.target.value })}
              placeholder="IP printer (mis. 192.168.1.50)"
              inputMode="decimal"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
            <input
              value={port}
              onChange={(e) => saveNetwork({ port: Number(e.target.value) || 9100 })}
              placeholder="9100"
              className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-600">Lebar kertas</label>
            <select
              value={widthMm}
              onChange={(e) => saveNetwork({ widthMm: Number(e.target.value) })}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              <option value={58}>58 mm</option>
              <option value={80}>80 mm</option>
            </select>
          </div>
          <p className="text-[10px] leading-snug text-slate-500">
            Printer WiFi/LAN dengan ESC/POS (port 9100), mis. iWare 260WF. Server WMS mengirim
            langsung ke printer — tanpa driver, tanpa dialog. Pastikan server & printer satu
            jaringan.
          </p>
        </div>
      ) : null}

      {mode === "qz" ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <select
              value={qzPrinter}
              onChange={(e) => selectQz(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option value="">{qzList.length ? "Pilih printer" : "— (hubungkan dulu)"}</option>
              {qzPrinter && !qzList.includes(qzPrinter) ? (
                <option value={qzPrinter}>{qzPrinter}</option>
              ) : null}
              {qzList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadQzPrinters()}
              disabled={busy}
              className="shrink-0 rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] leading-snug text-slate-500">
            Butuh aplikasi QZ Tray berjalan di komputer ini.
          </p>
        </div>
      ) : null}

      {mode === "browser" ? (
        <p className="mt-2 text-[10px] leading-snug text-slate-500">
          Cetak lewat dialog browser (perlu klik Cetak). Untuk otomatis penuh, pilih mode WiFi/Jaringan.
        </p>
      ) : null}

      {mode !== "browser" ? (
        <button
          type="button"
          onClick={() => void testPrint()}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          Test cetak
        </button>
      ) : null}

      {msg ? <p className="mt-2 text-[11px] text-emerald-700">{msg}</p> : null}
      {err ? <p className="mt-2 text-[11px] text-red-600">{err}</p> : null}
    </div>
  );
}
