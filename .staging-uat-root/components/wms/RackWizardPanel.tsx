"use client";

import { useMemo, useState } from "react";
import { Loader2, Minus, Plus, Printer, Save } from "lucide-react";
import { buildRackCode } from "@/lib/inventory/rack-layout";
import { printLocationLabels } from "@/lib/inventory/print-location-label";
import { getErrorMessage } from "@/lib/errors";
import type { InvWarehouse } from "@/lib/inventory/types";

type Props = {
  warehouse: InvWarehouse | undefined;
  warehouseId: string;
  canEdit: boolean;
  existingRackCodes: Set<string>;
  onSaved: () => void | Promise<void>;
};

function nextSlotLabel(items: string[]): string {
  const nums = items
    .map((s) => parseInt(s.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(n).padStart(2, "0");
}

export function RackWizardPanel({
  warehouse,
  warehouseId,
  canEdit,
  existingRackCodes,
  onSaved,
}: Props) {
  const [aisle, setAisle] = useState("");
  const [rack, setRack] = useState("");
  const [rackName, setRackName] = useState("");
  const [levels, setLevels] = useState<string[]>(["1", "2"]);
  const [bins, setBins] = useState<string[]>(["01", "02"]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const rackCode = useMemo(() => buildRackCode(aisle, rack), [aisle, rack]);
  const rackExists = rackCode ? existingRackCodes.has(rackCode) : false;
  const slotCount = levels.filter((l) => l.trim()).length * bins.filter((b) => b.trim()).length;

  const addLevel = () => setLevels((prev) => [...prev, String(prev.length + 1)]);
  const addBin = () => setBins((prev) => [...prev, nextSlotLabel(prev)]);

  const removeAt = (list: string[], index: number) =>
    list.length > 1 ? list.filter((_, i) => i !== index) : list;

  const saveRack = async () => {
    if (!canEdit) {
      alert("Akun Anda tidak punya izin membuat lokasi rak.");
      return;
    }
    if (!warehouseId) {
      alert("Pilih gudang terlebih dahulu.");
      return;
    }
    if (!rackCode) {
      alert("Isi lorong dan kode rak.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/inventory/locations/rack", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse: warehouseId,
          aisle,
          rack,
          name: rackName.trim() || `Rak ${rack}`,
          levels,
          slots: bins,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rackCode?: string;
        slotsCreated?: number;
        slotsSkipped?: number;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Gagal menyimpan rak");
      }
      const parts = [`Rak ${json.rackCode ?? rackCode} disimpan.`];
      if (json.slotsCreated) parts.push(`${json.slotsCreated} slot siap dipakai putaway.`);
      if (json.slotsSkipped) parts.push(`${json.slotsSkipped} slot sudah ada.`);
      setMessage(parts.join(" "));
      await onSaved();
    } catch (err) {
      const msg = getErrorMessage(err, "Gagal menyimpan rak");
      setMessage(msg);
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const printRackLabel = () => {
    if (!warehouse?.code || !rackCode) return;
    printLocationLabels({
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      items: [
        {
          code: rackCode,
          name: rackName.trim() || `Rak ${rack}`,
          aisle: aisle.trim().toUpperCase(),
          rack: rack.trim().toUpperCase(),
        },
      ],
    });
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Buat rak (satu kode + tingkat & slot)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Satu kode rak untuk ditempel (mis. <strong>SER-A</strong>). Saat putaway, staff pilih rak → tingkat → slot
        yang sudah disiapkan di bawah.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          Lorong
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 font-mono uppercase"
            value={aisle}
            onChange={(e) => setAisle(e.target.value)}
            placeholder="SER"
            disabled={!canEdit}
          />
        </label>
        <label className="block text-sm">
          Kode rak
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 font-mono uppercase"
            value={rack}
            onChange={(e) => setRack(e.target.value)}
            placeholder="A"
            disabled={!canEdit}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Nama rak (opsional)
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={rackName}
            onChange={(e) => setRackName(e.target.value)}
            placeholder="Rak A"
            disabled={!canEdit}
          />
        </label>
      </div>

      {rackCode ? (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
          <p className="text-xs text-indigo-800">
            <strong>Kode cetak (1 label per rak):</strong>{" "}
            <span className="font-mono text-sm font-bold">{rackCode}</span>
            {rackExists ? (
              <span className="ml-2 text-amber-700">— sudah ada, simpan akan memperbarui tingkat/slot</span>
            ) : (
              <span className="ml-2 text-green-700">— baru</span>
            )}
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            {slotCount} kombinasi tingkat×slot untuk dipilih saat susun barang
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Tingkat / susunan</span>
            {canEdit ? (
              <button
                type="button"
                onClick={addLevel}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="h-3.5 w-3.5" /> Tambah
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {levels.map((lv, i) => (
              <div key={`lv-${i}`} className="flex items-center gap-1">
                <input
                  className="w-16 rounded-lg border px-2 py-1.5 text-center font-mono text-sm"
                  value={lv}
                  onChange={(e) =>
                    setLevels((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  disabled={!canEdit}
                />
                {canEdit && levels.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLevels((prev) => removeAt(prev, i))}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Slot</span>
            {canEdit ? (
              <button
                type="button"
                onClick={addBin}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="h-3.5 w-3.5" /> Tambah
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {bins.map((bn, i) => (
              <div key={`bn-${i}`} className="flex items-center gap-1">
                <input
                  className="w-16 rounded-lg border px-2 py-1.5 text-center font-mono text-sm"
                  value={bn}
                  onChange={(e) =>
                    setBins((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  disabled={!canEdit}
                />
                {canEdit && bins.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setBins((prev) => removeAt(prev, i))}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}

      {!canEdit ? (
        <p className="mt-4 text-sm text-amber-800">
          Akun tidak punya izin inventory. Minta admin set <strong>inventory_role</strong> (staff/admin)
          atau login sebagai owner.
        </p>
      ) : null}

      {rackCode ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveRack()}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan rak {rackCode}
          </button>
          <button
            type="button"
            onClick={printRackLabel}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Cetak label rak
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Isi lorong dan kode rak untuk menampilkan tombol simpan.</p>
      )}
    </div>
  );
}
