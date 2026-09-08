"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchMovements, fetchWarehouses, postMovement } from "@/lib/inventory/client";
import { canPostInventoryMovement } from "@/lib/inventory/access";
import { labelMovementStatus, labelMovementType, MOVEMENT_STATUS_LABELS } from "@/lib/inventory/labels";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { InvMovement } from "@/lib/inventory/types";
import { formatIntegerId } from "@/lib/format-number";
import { Loader2, Plus } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  posted: "bg-emerald-100 text-emerald-800",
  void: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-600",
};

export default function InventoryMovementsPage() {
  const user = pb.authStore.model;
  const canPost = user && canPostInventoryMovement(user);
  const [items, setItems] = useState<InvMovement[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [banner, setBanner] = useState("");
  const [whCodeById, setWhCodeById] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchMovements({ status: status || undefined });
      setItems(res.items as unknown as InvMovement[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWarehouses().then((list) => {
      setWhCodeById(Object.fromEntries(list.map((w) => [w.id, w.code])));
    });
  }, []);

  useEffect(() => {
    void load();
  }, [status]);

  const handleQuickPost = async (id: string) => {
    setPostingId(id);
    setBanner("");
    try {
      await postMovement(id);
      setBanner("Mutasi berhasil diposting — cek tab Stok.");
      await load();
    } catch (err) {
      setBanner(getErrorMessage(err));
    } finally {
      setPostingId(null);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell title="Mutasi stok" subtitle="Transfer antar gudang. Stok masuk/keluar otomatis dari penjualan & pembelian.">
        {banner ? (
          <p className={"rounded-lg px-3 py-2 text-sm " + (banner.includes("berhasil") ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>
            {banner}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Semua status</option>
            <option value="draft">{MOVEMENT_STATUS_LABELS.draft}</option>
            <option value="posted">{MOVEMENT_STATUS_LABELS.posted}</option>
          </select>
          <Link
            href="/inventory/movements/new"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Mutasi baru
          </Link>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Gudang</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Belum ada mutasi.
                  </td>
                </tr>
              ) : (
                items.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{m.movement_no}</td>
                    <td className="px-4 py-3">{labelMovementType(m.movement_type)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (STATUS_BADGE[m.status] || STATUS_BADGE.draft)
                        }
                      >
                        {labelMovementStatus(m.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.expand?.warehouse?.code ||
                        (m.warehouse ? whCodeById[m.warehouse] : undefined) ||
                        "—"}
                    </td>
                    <td className="px-4 py-3">{formatIntegerId(m.total_qty ?? 0)}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {m.status === "draft" && canPost ? (
                        <button
                          type="button"
                          disabled={postingId === m.id}
                          onClick={() => void handleQuickPost(m.id)}
                          className="font-medium text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          {postingId === m.id ? "Mem posting…" : "Posting"}
                        </button>
                      ) : null}
                      <Link href={`/inventory/movements/${m.id}`} className="text-indigo-600 hover:underline">
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
