"use client";

import { useEffect, useState } from "react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchAuditLogs, fetchWarehouses } from "@/lib/inventory/client";
import { isInventorySupervisorOrAbove } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import type { InvAuditLog, InvWarehouse } from "@/lib/inventory/types";
import { Loader2 } from "lucide-react";

export default function InventoryAuditPage() {
  const user = pb.authStore.model;
  const allowed = user && isInventorySupervisorOrAbove(user);
  const [items, setItems] = useState<InvAuditLog[]>([]);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (whId: string) => {
    setLoading(true);
    try {
      setItems(await fetchAuditLogs({ warehouseId: whId || undefined }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWarehouses().then((list) => {
      setWarehouses(list);
      void load("");
    });
  }, []);

  useEffect(() => {
    void load(warehouseId);
  }, [warehouseId]);

  if (!allowed) {
    return (
      <InventoryGate>
        <InventoryShell title="Log audit" subtitle="Hanya supervisor/admin.">
          <p className="text-sm text-slate-600">Akses ditolak.</p>
        </InventoryShell>
      </InventoryGate>
    );
  }

  return (
    <InventoryGate>
      <InventoryShell title="Log audit" subtitle="Jejak perubahan stok dan operasi gudang (hanya tambah).">
        <label className="text-sm">
          Filter gudang
          <select
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">Semua gudang</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </label>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Aksi</th>
                <th className="px-4 py-3">Entitas</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Gudang</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Belum ada entri audit (posting mutasi otomatis menulis log).
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(row.occurred_at).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{row.action}</td>
                    <td className="px-4 py-3">
                      {row.entity_type}
                      <span className="block text-xs text-slate-400">{row.entity_id}</span>
                    </td>
                    <td className="px-4 py-3">
                      {row.expand?.user?.email || row.expand?.user?.name || row.user}
                    </td>
                    <td className="px-4 py-3">{row.expand?.warehouse?.code || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </InventoryShell>
    </InventoryGate>
  );
}
