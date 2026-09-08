"use client";

import { useEffect, useState } from "react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { useWorkContext } from "@/components/WorkContextProvider";
import { fetchAuditLogs } from "@/lib/inventory/client";
import { isInventorySupervisorOrAbove } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import type { InvAuditLog } from "@/lib/inventory/types";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export default function InventoryAuditPage() {
  const { t } = useLocale();
  const user = pb.authStore.model;
  const allowed = user && isInventorySupervisorOrAbove(user);
  const { warehouses } = useWorkContext();
  const [items, setItems] = useState<InvAuditLog[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await fetchAuditLogs({ warehouseId: warehouseId || undefined });
        if (!cancelled) setItems(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  if (!allowed) {
    return (
      <InventoryGate>
        <InventoryShell title={t("inventory.audit.title")} subtitle={t("inventory.audit.subtitle")}>
          <p className="text-sm text-slate-600">Akses ditolak.</p>
        </InventoryShell>
      </InventoryGate>
    );
  }

  return (
    <InventoryGate>
      <InventoryShell title={t("inventory.audit.title")} subtitle={t("inventory.audit.subtitle")}>
        <label className="text-sm">
          {t("inventory.common.warehouse")}
          <select
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">{t("inventory.common.all")}</option>
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
                <th className="px-4 py-3">{t("inventory.common.actions")}</th>
                <th className="px-4 py-3">{t("inventory.common.entity")}</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">{t("inventory.common.warehouse")}</th>
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
                    {t("inventory.audit.empty")}
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
