"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  fetchActiveZoneSession,
  fetchWarehouses,
  fetchZones,
  zoneCheckIn,
  zoneCheckOut,
} from "@/lib/inventory/client";
import { getErrorMessage } from "@/lib/errors";
import type { InvZone, InvZoneSession, InvWarehouse } from "@/lib/inventory/types";
import { Loader2, LogIn, LogOut, ScanLine } from "lucide-react";

export default function ZoneCheckInPage() {
  const [session, setSession] = useState<InvZoneSession | null>(null);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [zones, setZones] = useState<InvZone[]>([]);
  const [qrInput, setQrInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, wh] = await Promise.all([fetchActiveZoneSession(), fetchWarehouses()]);
      setSession(s);
      setWarehouses(wh);
      if (wh[0] && !warehouseId) setWarehouseId(wh[0].id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    void fetchZones(warehouseId)
      .then(setZones)
      .catch((err) => setError(getErrorMessage(err)));
  }, [warehouseId]);

  const checkIn = async (input: { qr_payload?: string; zone_id?: string }) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await zoneCheckIn(input);
      setMessage("Masuk zona berhasil.");
      setQrInput("");
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await zoneCheckOut();
      setMessage("Keluar zona berhasil.");
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const zoneLabel = session?.expand?.zone
    ? `${session.expand.zone.code} — ${session.expand.zone.name}`
    : session?.zone;

  return (
    <InventoryGate>
      <InventoryShell
        title="Masuk zona"
        subtitle="Scan QR di gudang atau pilih zona manual. Satu sesi aktif per gudang."
      >
        <Link href="/inventory/zones" className="text-sm text-indigo-600 hover:underline">
          ← Kelola zona &amp; cetak QR
        </Link>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <>
            {session ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-900">Sesi aktif</p>
                <p className="mt-1 text-lg font-semibold text-emerald-950">{zoneLabel}</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Masuk: {new Date(session.check_in_at).toLocaleString("id-ID")}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void checkOut()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
                >
                  <LogOut className="h-4 w-4" />
                  {busy ? "Memproses…" : "Keluar zona"}
                </button>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                Belum ada sesi aktif. Masuk ke zona kerja Anda.
              </p>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <ScanLine className="h-5 w-5 text-indigo-600" />
                Scan / tempel QR
              </h2>
              <textarea
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                rows={2}
                placeholder={
                  zones[0]?.qr_payload || "serba:zone:GD-2245:KODE_ZONA_ANDA"
                }
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
              />
              {zones.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  QR zona aktif:{" "}
                  <span className="font-mono">{zones.map((z) => z.qr_payload).join(" · ")}</span>
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy || !qrInput.trim()}
                onClick={() => void checkIn({ qr_payload: qrInput.trim() })}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                Masuk dari QR
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800">Pilih zona manual</h2>
              <select
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex flex-wrap gap-2">
                {zones.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void checkIn({ zone_id: z.id })}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:bg-indigo-50"
                  >
                    {z.code}
                  </button>
                ))}
              </div>
            </div>

            {message ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
            ) : null}
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
          </>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
