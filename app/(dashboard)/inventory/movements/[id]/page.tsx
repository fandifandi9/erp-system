"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  fetchCctvCameras,
  fetchMovementDetail,
  postMovementWithCctv,
  voidMovement,
} from "@/lib/inventory/client";
import { canPostInventoryMovement, isInventorySupervisorOrAbove } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { CctvSnapshot, InvMovement, InvMovementLine } from "@/lib/inventory/types";
import { labelMovementStatus, labelMovementType } from "@/lib/inventory/labels";
import { formatIntegerId } from "@/lib/format-number";
import { Loader2 } from "lucide-react";

export default function InventoryMovementDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id || "");
  const user = pb.authStore.model;
  const canPost = user && canPostInventoryMovement(user);
  const canVoid = user && isInventorySupervisorOrAbove(user);

  const [movement, setMovement] = useState<InvMovement | null>(null);
  const [lines, setLines] = useState<InvMovementLine[]>([]);
  const [cameras, setCameras] = useState<{ id: string; code: string; name: string }[]>([]);
  const [cctvId, setCctvId] = useState("");
  const [voidNote, setVoidNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMovementDetail(id);
      setMovement(data.movement);
      setLines(data.lines as unknown as InvMovementLine[]);
      if (data.movement.warehouse) {
        const cams = await fetchCctvCameras(data.movement.warehouse);
        setCameras(cams.map((c) => ({ id: c.id, code: c.code, name: c.name })));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void load();
  }, [id]);

  useEffect(() => {
    if (searchParams.get("posted") === "1") {
      setMsg("Mutasi diposting — stok gudang sudah diperbarui. Refresh halaman katalog produk untuk melihat perubahan per gudang.");
    }
  }, [searchParams]);

  const handlePost = async () => {
    setPosting(true);
    setError("");
    setMsg("");
    try {
      const res = await postMovementWithCctv(id, cctvId || undefined);
      setMsg(`Berhasil diposting: ${res.movement_no}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const handleVoid = async () => {
    if (!confirm("Batalkan mutasi ini? Stok akan dibalik via mutasi pembalikan.")) return;
    setVoiding(true);
    setError("");
    setMsg("");
    try {
      const res = await voidMovement(id, voidNote);
      setMsg(`Mutasi dibatalkan. Pembalikan: ${res.reversal_id || "—"}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setVoiding(false);
    }
  };

  const snapshot = movement?.cctv_snapshot as CctvSnapshot | undefined;

  return (
    <InventoryGate>
      <InventoryShell
        title={movement?.movement_no || "Mutasi"}
        subtitle={
          movement
            ? `${labelMovementType(movement.movement_type)} · ${labelMovementStatus(movement.status)}`
            : ""
        }
      >
        <Link href="/inventory/movements" className="text-sm text-indigo-600 hover:underline">
          ← Daftar mutasi
        </Link>

        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        ) : !movement ? (
          <p className="text-red-600">{error || "Tidak ditemukan."}</p>
        ) : (
          <>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

            {movement.status === "draft" ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <strong>Status: Draft</strong> — stok belum berubah di katalog/gudang. Klik{" "}
                <strong>Posting mutasi</strong> di bawah agar saldo GD-01, CUBUS, dll. terupdate.
              </div>
            ) : null}

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
                <p className="mt-1 text-slate-500">
                  Diposting: {new Date(movement.posted_at).toLocaleString("id-ID")}
                </p>
              ) : null}
              {snapshot?.camera_code ? (
                <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">
                  CCTV: {snapshot.camera_code} ch.{snapshot.channel || "—"} ·{" "}
                  {snapshot.event_at ? new Date(snapshot.event_at).toLocaleString("id-ID") : ""}
                  {snapshot.playback_hint_url ? (
                    <>
                      {" "}
                      ·{" "}
                      <a
                        href={snapshot.playback_hint_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        Playback NVR
                      </a>
                    </>
                  ) : null}
                </p>
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
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                {cameras.length > 0 ? (
                  <label className="block text-sm">
                    Referensi CCTV (opsional)
                    <select
                      className="mt-1 w-full max-w-md rounded-lg border px-3 py-2"
                      value={cctvId}
                      onChange={(e) => setCctvId(e.target.value)}
                    >
                      <option value="">Tanpa snapshot CCTV</option>
                      {cameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handlePost()}
                  disabled={posting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {posting ? "Mem posting…" : "Posting mutasi (perbarui stok)"}
                </button>
              </div>
            ) : null}

            {movement.status === "posted" && canVoid ? (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <p className="text-sm text-amber-900">Batalkan posting dan kembalikan stok.</p>
                <input
                  className="w-full max-w-md rounded-lg border px-3 py-2 text-sm"
                  placeholder="Alasan pembatalan (opsional)"
                  value={voidNote}
                  onChange={(e) => setVoidNote(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void handleVoid()}
                  disabled={voiding}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {voiding ? "Memproses…" : "Batalkan mutasi"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
