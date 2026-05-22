"use client";

import { useEffect, useState } from "react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import Link from "next/link";
import { fetchBalances, fetchMovements, fetchWarehouses } from "@/lib/inventory/client";
import type { InvStockBalance, InvWarehouse } from "@/lib/inventory/types";
import { formatIntegerId } from "@/lib/format-number";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function InventoryStockPage() {
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState<InvStockBalance[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchWarehouses().then((w) => {
      setWarehouses(w);
      if (w[0]) setWarehouseId(w[0].id);
    });
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    setLoading(true);
    void Promise.all([
      fetchBalances(warehouseId),
      fetchMovements({ status: "draft", page: 1 }),
    ]).then(([b, drafts]) => {
      setRows(b);
      setDraftCount(drafts.totalItems);
      setLoading(false);
    });
  }, [warehouseId]);

  return (
    <InventoryGate>
      <InventoryShell title="Stok realtime" subtitle="Qty on hand per gudang — di-update saat movement diposting.">
        {!loading && rows.length === 0 && draftCount > 0 ? (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Ada {draftCount} movement masih draft</p>
              <p className="mt-1">
                Stok belum berubah. Buka <strong>Movement</strong> → <strong>Detail</strong> →{" "}
                <strong>Post movement</strong>.
              </p>
              <Link href="/inventory/movements" className="mt-2 inline-block font-medium text-indigo-700 hover:underline">
                Ke daftar movement →
              </Link>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">
            Gudang{" "}
            <select
              className="ml-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">On hand</th>
                <th className="px-4 py-3">Reserved</th>
                <th className="px-4 py-3">Available</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Belum ada saldo. Buat movement IN lalu <strong>post</strong> (bukan hanya simpan draft).
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const p = r.expand?.product;
                  const low = p && (p.min_stock ?? 0) > 0 && (r.qty_on_hand ?? 0) < (p.min_stock ?? 0);
                  return (
                    <tr
                      key={r.id}
                      className={"border-t border-slate-100 " + (low ? "bg-amber-50/80" : "")}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{p?.sku || "—"}</td>
                      <td className="px-4 py-3">{p?.name || r.product}</td>
                      <td className="px-4 py-3 font-semibold">{formatIntegerId(r.qty_on_hand)}</td>
                      <td className="px-4 py-3">{formatIntegerId(r.qty_reserved)}</td>
                      <td className="px-4 py-3">{formatIntegerId(r.qty_available)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </InventoryShell>
    </InventoryGate>
  );
}
