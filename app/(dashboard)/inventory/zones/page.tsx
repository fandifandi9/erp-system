"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { useWorkContext } from "@/components/WorkContextProvider";
import { ZoneQrDisplay } from "@/components/inventory/ZoneQrDisplay";
import { fetchZones } from "@/lib/inventory/client";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { buildZoneQrPayload } from "@/lib/inventory/zone-qr";
import { formatWarehouseLabel } from "@/lib/inventory/display";
import { printZoneQrLabel } from "@/lib/inventory/print-zone-qr";
import {
  INV_COLLECTIONS,
  ZONE_TYPES,
  type InvZone,
  type ZoneType,
} from "@/lib/inventory/types";
import { getErrorMessage } from "@/lib/errors";
import Link from "next/link";
import { Loader2, Plus, QrCode } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export default function InventoryZonesPage() {
  const { t } = useLocale();
  const user = pb.authStore.model;
  const canEdit = user && canManageInventoryMaster(user);
  const { warehouses, loading: ctxLoading } = useWorkContext();
  const [warehouseId, setWarehouseId] = useState("");
  const [zones, setZones] = useState<InvZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [qrZone, setQrZone] = useState<InvZone | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    zone_type: "receiving" as ZoneType,
  });

  const load = async (whId: string) => {
    setLoading(true);
    setError("");
    try {
      setZones(await fetchZones(whId || undefined));
    } catch (err) {
      setError(getErrorMessage(err));
      setZones([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ctxLoading) return;
    if (warehouses.length === 0) {
      setLoading(false);
      return;
    }
    if (!warehouseId) setWarehouseId(warehouses[0].id);
  }, [ctxLoading, warehouses, warehouseId]);

  useEffect(() => {
    if (!warehouseId) return;
    void load(warehouseId);
  }, [warehouseId]);

  const whCode = warehouses.find((w) => w.id === warehouseId)?.code || "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !warehouseId) return;
    setSaving(true);
    setError("");
    try {
      const code = form.code.trim().toUpperCase();
      const qr_payload = buildZoneQrPayload(whCode, code);
      const createdZone = await pb.collection(INV_COLLECTIONS.zones).create({
        warehouse: warehouseId,
        code,
        name: form.name.trim() || code,
        zone_type: form.zone_type,
        qr_payload,
        qr_version: 1,
        requires_station: form.zone_type === "packing",
        sort_order: 0,
        is_active: true,
      });
      if (form.zone_type === "packing") {
        await pb.collection(INV_COLLECTIONS.packingStations).create({
          zone: createdZone.id,
          warehouse: warehouseId,
          code: "PACK-01",
          name: "Meja kemasan 1",
          qr_payload: `serba:pack:${whCode}:${code}:PACK-01`,
          is_active: true,
        });
      }
      setModal(false);
      setForm({ code: "", name: "", zone_type: "receiving" });
      await load(warehouseId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title={t("inventory.zones.title")}
        subtitle={t("inventory.zones.subtitle")}
      >
        {error && !modal ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/inventory/zones/checkin"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
          >
            <QrCode className="h-4 w-4" /> Masuk zona
          </Link>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setModal(true)}
              disabled={!warehouseId}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Zona baru
            </button>
          ) : null}
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("inventory.common.code")}</th>
                <th className="px-4 py-3">{t("inventory.common.name")}</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">QR</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : zones.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    {t("inventory.zones.empty")}
                  </td>
                </tr>
              ) : (
                zones.map((z) => (
                  <tr key={z.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono">{z.code}</td>
                    <td className="px-4 py-3">{z.name}</td>
                    <td className="px-4 py-3 capitalize">{z.zone_type}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setQrZone(z)}
                          className="text-indigo-600 hover:underline"
                        >
                          Lihat QR
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            printZoneQrLabel({
                              payload: z.qr_payload,
                              zoneCode: z.code,
                              zoneName: z.name,
                              zoneType: z.zone_type,
                              warehouseCode: warehouses.find((w) => w.id === z.warehouse)?.code,
                              warehouseName: warehouses.find((w) => w.id === z.warehouse)?.name,
                            })
                          }
                          className="text-slate-600 hover:underline"
                        >
                          Cetak
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form
              onSubmit={submit}
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-semibold">Zona baru</h3>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <label className="mt-4 block text-sm">
                Kode zona
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="RECEIVING"
                />
              </label>
              <label className="mt-3 block text-sm">
                {t("inventory.common.name")}
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="mt-3 block text-sm">
                Tipe
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.zone_type}
                  onChange={(e) =>
                    setForm({ ...form, zone_type: e.target.value as ZoneType })
                  }
                >
                  {ZONE_TYPES.map((zt) => (
                    <option key={zt.value} value={zt.value}>
                      {zt.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm text-slate-600"
                  onClick={() => setModal(false)}
                >
                  {t("inventory.common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
                >
                  {saving ? t("inventory.common.loading") : t("inventory.common.save")}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {qrZone ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="rounded-xl bg-white p-6 shadow-xl">
              <h3 className="mb-1 text-lg font-semibold">QR — {qrZone.code}</h3>
              <p className="mb-4 text-sm text-slate-500">
                {formatWarehouseLabel(
                  warehouses.find((w) => w.id === qrZone.warehouse),
                  qrZone.warehouse
                )}
              </p>
              <ZoneQrDisplay
                payload={qrZone.qr_payload}
                label={qrZone.name}
                size={200}
                printMeta={{
                  payload: qrZone.qr_payload,
                  zoneCode: qrZone.code,
                  zoneName: qrZone.name,
                  zoneType: qrZone.zone_type,
                  warehouseCode: warehouses.find((w) => w.id === qrZone.warehouse)?.code,
                  warehouseName: warehouses.find((w) => w.id === qrZone.warehouse)?.name,
                }}
              />
              <button
                type="button"
                className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm"
                onClick={() => setQrZone(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        ) : null}
      </InventoryShell>
    </InventoryGate>
  );
}
