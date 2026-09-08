"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchPackingSessions } from "@/lib/inventory/client";
import { getErrorMessage } from "@/lib/errors";
import type { InvPackingSession } from "@/lib/inventory/types";
import { labelPackingStatus } from "@/lib/inventory/labels";
import { Loader2 } from "lucide-react";

export default function InventoryPackingPage() {
  const [items, setItems] = useState<InvPackingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchPackingSessions();
        setItems(res.items as unknown as InvPackingSession[]);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <InventoryGate>
      <InventoryShell
        title="Kemasan"
        subtitle="Sesi kemasan order — scan checklist di meja kemasan (zona kemasan)."
      >
        <p className="text-sm text-slate-600">
          Mulai sesi dari HP setelah masuk zona kemasan, atau buka detail sesi yang sudah ada.
        </p>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mulai</th>
                <th className="px-4 py-3">Petugas</th>
                <th className="px-4 py-3" />
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
                    Belum ada sesi kemasan.
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{s.order_ref}</td>
                    <td className="px-4 py-3">{labelPackingStatus(s.status)}</td>
                    <td className="px-4 py-3">
                      {s.started_at ? new Date(s.started_at).toLocaleString("id-ID") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.expand?.packed_by?.email || s.expand?.packed_by?.name || s.packed_by}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/inventory/packing/${s.id}`} className="text-indigo-600 hover:underline">
                        Detail
                      </Link>
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
