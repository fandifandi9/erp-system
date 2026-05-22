"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchMovementDetail, postMovement } from "@/lib/inventory/client";
import { canPostInventoryMovement } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { InvMovement, InvMovementLine } from "@/lib/inventory/types";
import { formatIntegerId } from "@/lib/format-number";
import { Loader2 } from "lucide-react";

export default function InventoryMovementDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const user = pb.authStore.model;
  const canPost = user && canPostInventoryMovement(user);

  const [movement, setMovement] = useState<InvMovement | null>(null);
  const [lines, setLines] = useState<InvMovementLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMovementDetail(id);
      setMovement(data.movement);
      setLines(data.lines as unknown as InvMovementLine[]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void load();
  }, [id]);

  const handlePost = async () => {
    setPosting(true);
    setError("");
    setMsg("");
    try {
      const res = await postMovement(id);
      setMsg(`Berhasil diposting: ${res.movement_no}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title={movement?.movement_no || "Movement"}
        subtitle={movement ? `${movement.movement_type} · ${movement.status}` : ""}
      >
        <Link href="/inventory/movements" className="text-sm text-indigo-600 hover:underline">
          ← Daftar movement
        </Link>

        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        ) : !movement ? (
          <p className="text-red-600">{error || "Tidak ditemukan."}</p>
        ) : (
          <>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <p>
                <span className="text-slate-500">Gudang:</span> {movement.expand?.warehouse?.name}
              </p>
              {movement.notes ? (
                <p className="mt-1">
                  <span className="text-slate-500">Catatan:</span> {movement.notes}
                </p>
              ) : null}
              {movement.posted_at ? (
                <p className="mt-1 text-slate-500">Posted: {new Date(movement.posted_at).toLocaleString("id-ID")}</p>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Produk</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        {line.expand?.product?.sku} — {line.expand?.product?.name}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatIntegerId(line.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {movement.status === "draft" && canPost ? (
              <button
                type="button"
                onClick={() => void handlePost()}
                disabled={posting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {posting ? "Mem posting…" : "Post movement (update stok)"}
              </button>
            ) : null}
          </>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
