"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsBadge, WmsCard, WmsNavTile, WmsSectionTitle, WmsLoading } from "@/components/wms/ui";
import { fetchZones, fetchWarehouses } from "@/lib/inventory/client";
import { formatZoneLabel } from "@/lib/inventory/display";
import type { InvZone, InvWarehouse } from "@/lib/inventory/types";

export default function WmsQcPage() {
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [zones, setZones] = useState<InvZone[]>([]);
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
    void fetchZones(warehouseId)
      .then((z) => setZones(z.filter((x) => x.zone_type === "qc")))
      .finally(() => setLoading(false));
  }, [warehouseId]);

  return (
    <InventoryGate>
      <InventoryShell title="Quality Control" subtitle="Inspeksi barang setelah penerimaan — sebelum stok tersedia." module="wms">
        <div className="grid gap-4 sm:grid-cols-2">
          <WmsNavTile
            href="/gudang/penerimaan"
            label="Dari penerimaan"
            description="Lanjutkan QC setelah goods receipt"
            icon={ShieldCheck}
            accent="amber"
          />
          <WmsNavTile
            href="/gudang/stok"
            label="Lihat stok gudang"
            description="Setelah QC lulus, stok langsung masuk gudang"
            icon={ShieldCheck}
            accent="emerald"
          />
        </div>

        <WmsCard>
          <WmsSectionTitle title="Zona QC aktif" />
          <select
            className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
          {loading ? (
            <WmsLoading />
          ) : zones.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Belum ada zona QC. Buat di{" "}
              <Link href="/inventory/zones" className="text-indigo-600 hover:underline">
                Master zona
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {zones.map((z) => (
                <li
                  key={z.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{formatZoneLabel(z)}</p>
                    <p className="font-mono text-xs text-slate-500">{z.qr_payload}</p>
                  </div>
                  <WmsBadge tone="amber">QC</WmsBadge>
                </li>
              ))}
            </ul>
          )}
        </WmsCard>
      </InventoryShell>
    </InventoryGate>
  );
}
