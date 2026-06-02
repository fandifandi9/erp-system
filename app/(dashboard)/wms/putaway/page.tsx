"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPinned, Warehouse } from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  WmsBadge,
  WmsCard,
  WmsChip,
  WmsNavTile,
  WmsSectionTitle,
  WmsLoading,
} from "@/components/wms/ui";
import { fetchLocations, fetchWarehouses, fetchZones } from "@/lib/inventory/client";
import { formatWarehouseLabel, formatZoneLabel } from "@/lib/inventory/display";
import type { InvLocation, InvWarehouse, InvZone } from "@/lib/inventory/types";

export default function WmsPutawayPage() {
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [zones, setZones] = useState<InvZone[]>([]);
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [zoneFilter, setZoneFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchWarehouses().then((list) => {
      setWarehouses(list);
      if (list[0]) setWarehouseId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    setLoading(true);
    void Promise.all([fetchZones(warehouseId), fetchLocations(warehouseId)])
      .then(([z, loc]) => {
        setZones(z);
        setLocations(loc);
        if (z[0]) setZoneFilter(z[0].id);
      })
      .finally(() => setLoading(false));
  }, [warehouseId]);

  const filteredLoc = locations;

  const wh = warehouses.find((w) => w.id === warehouseId);

  return (
    <InventoryGate>
      <InventoryShell
        title="Putaway"
        subtitle="Visual hierarki gudang → zona → rak → bin. Mutasi transfer ke lokasi via mutasi stok."
        module="wms"
      >
        <WmsCard className="overflow-hidden p-0">
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <Warehouse className="h-8 w-8 text-indigo-300" />
              <div>
                <p className="text-xs uppercase tracking-wider text-indigo-300">Gudang</p>
                <p className="text-lg font-bold">{wh ? formatWarehouseLabel(wh) : "—"}</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-auto"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
          </div>
        </WmsCard>

        {loading ? (
          <WmsLoading />
        ) : (
          <>
            <WmsSectionTitle title="Zona" subtitle="Pilih zona untuk filter rak" />
            <div className="flex flex-wrap gap-2">
              {zones.map((z) => (
                <WmsChip key={z.id} active={zoneFilter === z.id} onClick={() => setZoneFilter(z.id)}>
                  {formatZoneLabel(z)}
                </WmsChip>
              ))}
            </div>

            <WmsSectionTitle title="Lokasi rak / bin" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLoc.length === 0 ? (
                <WmsCard className="sm:col-span-2 lg:col-span-3">
                  <p className="text-sm text-slate-500">
                    Belum ada lokasi. Kelola di{" "}
                    <Link href="/inventory/locations" className="text-indigo-600 hover:underline">
                      Lokasi rak
                    </Link>
                    .
                  </p>
                </WmsCard>
              ) : (
                filteredLoc.map((loc) => (
                  <WmsCard key={loc.id} hover className="!p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-bold text-indigo-600">{loc.code}</p>
                        <p className="text-sm text-slate-700">{loc.name || loc.code}</p>
                      </div>
                      <MapPinned className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <WmsBadge tone="slate">{loc.zone_type || "rak"}</WmsBadge>
                    </div>
                  </WmsCard>
                ))
              )}
            </div>
          </>
        )}

        <WmsNavTile
          href="/inventory/movements/new"
          label="Mutasi transfer / IN ke lokasi"
          description="Buat mutasi dengan lokasi tujuan"
          icon={MapPinned}
          accent="indigo"
        />
      </InventoryShell>
    </InventoryGate>
  );
}
