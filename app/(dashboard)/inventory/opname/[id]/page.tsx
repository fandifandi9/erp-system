"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  approveOpnameApi,
  fetchOpnameDetailApi,
  startOpnameCountingApi,
  submitOpnameLineApi,
  submitOpnameReviewApi,
} from "@/lib/inventory/client";
import { isInventorySupervisorOrAbove } from "@/lib/inventory/access";
import { getErrorMessage } from "@/lib/errors";
import type { InvOpnameLine, InvOpnameSession } from "@/lib/inventory/types";
import { labelOpnameStatus } from "@/lib/inventory/labels";
import { Loader2 } from "lucide-react";

export default function InventoryOpnameDetailPage() {
  const params = useParams();
  const sessionId = String(params.id || "");
  const user = pb.authStore.model;
  const isSupervisor = user && isInventorySupervisorOrAbove(user);

  const [session, setSession] = useState<InvOpnameSession | null>(null);
  const [lines, setLines] = useState<InvOpnameLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [countDraft, setCountDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchOpnameDetailApi(sessionId);
      setSession(data.session as InvOpnameSession);
      setLines(data.lines as InvOpnameLine[]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) void load();
  }, [sessionId, load]);

  const startCounting = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await startOpnameCountingApi(sessionId);
      setNotice(`Penghitungan dimulai — ${r.lineCount} baris.`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveLine = async (lineId: string) => {
    const raw = countDraft[lineId];
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Qty hitung tidak valid.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitOpnameLineApi(sessionId, lineId, qty);
      setNotice("Baris tersimpan.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    setBusy(true);
    setError("");
    try {
      await submitOpnameReviewApi(sessionId);
      setNotice("Diajukan ke supervisor untuk review.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      await approveOpnameApi(sessionId);
      setNotice("Opname disetujui — penyesuaian stok diposting.");
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
        title={session?.opname_no || "Opname"}
        subtitle={session ? `Status: ${labelOpnameStatus(session.status)}` : "Memuat…"}
      >
        <Link href="/inventory/opname" className="text-sm text-indigo-600 hover:underline">
          ← Daftar opname
        </Link>

        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        ) : (
          <>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

            <div className="flex flex-wrap gap-2">
              {session?.status === "draft" && isSupervisor ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startCounting()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  Mulai hitung (isi dari stok sistem)
                </button>
              ) : null}
              {session?.status === "counting" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitReview()}
                  className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
                >
                  Ajukan review
                </button>
              ) : null}
              {session?.status === "review" && isSupervisor ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void approve()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  Setujui & post penyesuaian
                </button>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-4 py-3">Sistem</th>
                    <th className="px-4 py-3">Hitung</th>
                    <th className="px-4 py-3">Selisih</th>
                    {session?.status === "counting" ? <th className="px-4 py-3" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono">{l.expand?.product?.sku}</td>
                      <td className="px-4 py-3">{l.expand?.product?.name || "—"}</td>
                      <td className="px-4 py-3">{l.system_qty}</td>
                      <td className="px-4 py-3">
                        {session?.status === "counting" ? (
                          <input
                            type="number"
                            min={0}
                            className="w-20 rounded border px-2 py-1"
                            value={countDraft[l.id] ?? String(l.counted_qty ?? "")}
                            onChange={(e) =>
                              setCountDraft((d) => ({ ...d, [l.id]: e.target.value }))
                            }
                          />
                        ) : (
                          (l.counted_qty ?? "—")
                        )}
                      </td>
                      <td className="px-4 py-3">{l.variance_qty ?? "—"}</td>
                      {session?.status === "counting" ? (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void saveLine(l.id)}
                            className="text-indigo-600 hover:underline disabled:opacity-60"
                          >
                            Simpan
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
