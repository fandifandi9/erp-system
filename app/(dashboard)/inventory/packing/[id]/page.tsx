"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  completePackingSessionApi,
  scanPackingSessionApi,
} from "@/lib/inventory/client";
import { canPostInventoryMovement } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { InvPackingChecklistLine, InvPackingSession } from "@/lib/inventory/types";
import { labelPackingStatus } from "@/lib/inventory/labels";
import { Loader2 } from "lucide-react";

export default function InventoryPackingDetailPage() {
  const params = useParams();
  const sessionId = String(params.id || "");
  const user = pb.authStore.model;
  const canPost = user && canPostInventoryMovement(user);

  const [session, setSession] = useState<InvPackingSession | null>(null);
  const [lines, setLines] = useState<InvPackingChecklistLine[]>([]);
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers: Record<string, string> = {};
      if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
      const res = await fetch(`/api/inventory/packing/sessions/${sessionId}`, {
        headers,
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { session: InvPackingSession; lines: InvPackingChecklistLine[] };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) throw new Error(json.error || "Gagal memuat.");
      setSession(json.data.session);
      setLines(json.data.lines);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) void load();
  }, [sessionId, load]);

  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await scanPackingSessionApi(sessionId, barcode.trim());
      setNotice(`OK: ${r.productName}`);
      setBarcode("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const complete = async (postOut: boolean) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await completePackingSessionApi(sessionId, postOut);
      setNotice(postOut ? "Kemasan selesai + stok keluar diposting." : "Kemasan selesai.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title={`Kemasan ${session?.order_ref || ""}`}
        subtitle={session ? `Status: ${labelPackingStatus(session.status)}` : "Memuat…"}
      >
        <Link href="/inventory/packing" className="text-sm text-indigo-600 hover:underline">
          ← Daftar kemasan
        </Link>

        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        ) : (
          <>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

            {session && session.status !== "completed" ? (
              <form onSubmit={scan} className="flex flex-wrap gap-2 rounded-xl border bg-white p-4">
                <input
                  className="min-w-[200px] flex-1 rounded-lg border px-3 py-2 text-sm"
                  placeholder="Scan / ketik barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  Scan
                </button>
              </form>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Scan</th>
                    <th className="px-4 py-3">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono">{l.sku_snapshot || l.expand?.product?.sku}</td>
                      <td className="px-4 py-3">{l.expand?.product?.name || "—"}</td>
                      <td className="px-4 py-3">{l.expected_qty}</td>
                      <td className="px-4 py-3">{l.scanned_qty}</td>
                      <td className="px-4 py-3">{l.is_complete ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {session && session.status !== "completed" ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void complete(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-60"
                >
                  Selesai (tanpa posting stok)
                </button>
                {canPost ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void complete(true)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                  >
                    Selesai + posting keluar
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
