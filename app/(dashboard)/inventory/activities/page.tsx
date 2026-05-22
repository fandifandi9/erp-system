"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchStaffActivities, fetchWarehouses } from "@/lib/inventory/client";
import {
  formatStaffDisplayName,
  formatWarehouseLabel,
  formatZoneLabel,
} from "@/lib/inventory/display";
import { canViewAllStaffActivities } from "@/lib/inventory/access";
import { getErrorMessage } from "@/lib/errors";
import type { InvStaffActivity, InvWarehouse } from "@/lib/inventory/types";
import { Loader2 } from "lucide-react";

const ACTIVITY_LABELS: Record<string, string> = {
  zone_checkin: "Check-in zona",
  zone_checkout: "Check-out zona",
  scan_zone_qr: "Scan QR zona",
  scan_product: "Scan produk",
  movement_create_draft: "Buat movement draft",
  movement_post_request: "Request post movement",
};

export default function InventoryActivitiesPage() {
  const user = pb.authStore.model as Record<string, unknown> | null;
  const userId = typeof user?.id === "string" ? user.id : "";
  const viewAll = Boolean(user && canViewAllStaffActivities(user));
  const [items, setItems] = useState<InvStaffActivity[]>([]);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchStaffActivities({
        warehouseId: warehouseId || undefined,
        userId: viewAll ? undefined : userId || undefined,
      });
      setItems(list);
    } catch (err) {
      setError(getErrorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWarehouses().then(setWarehouses);
  }, []);

  useEffect(() => {
    if (!userId && !viewAll) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, userId, viewAll]);

  return (
    <InventoryGate>
      <InventoryShell
        title="Aktivitas staff"
        subtitle={
          viewAll
            ? "Log check-in zona dan aktivitas gudang (supervisor+)."
            : "Riwayat aktivitas Anda di gudang."
        }
      >
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                {viewAll ? <th className="px-4 py-3">Staff</th> : null}
                <th className="px-4 py-3">Aktivitas</th>
                <th className="px-4 py-3">Zona / tempat</th>
                <th className="px-4 py-3">Gudang</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={viewAll ? 5 : 4} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={viewAll ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                    Belum ada aktivitas tercatat.
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {new Date(a.occurred_at).toLocaleString("id-ID")}
                    </td>
                    {viewAll ? (
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">
                          {formatStaffDisplayName(a.expand?.user, a.user)}
                        </span>
                        {a.expand?.user?.email ? (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {a.expand.user.email}
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      {ACTIVITY_LABELS[a.activity_type] || a.activity_type}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {formatZoneLabel(a.expand?.zone, a.zone)}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {formatWarehouseLabel(a.expand?.warehouse, a.warehouse)}
                    </td>
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
