"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  createMovementDraft,
  fetchProducts,
  fetchWarehouses,
  postMovement,
} from "@/lib/inventory/client";
import { canPostInventoryMovement } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { InvProduct, InvWarehouse, MovementType } from "@/lib/inventory/types";
import { Loader2, Plus, Trash2 } from "lucide-react";

type LineForm = { product: string; qty: string };

export default function NewMovementPage() {
  const router = useRouter();
  const user = pb.authStore.model;
  const canPostNow = user && canPostInventoryMovement(user);

  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [movementType, setMovementType] = useState<MovementType>("IN");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([{ product: "", qty: "1" }]);
  const [alsoPost, setAlsoPost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([fetchWarehouses(), fetchProducts()]).then(([w, p]) => {
      setWarehouses(w);
      setProducts(p.items as unknown as InvProduct[]);
      if (w[0]) setWarehouse(w[0].id);
    });
  }, []);

  const addLine = () => setLines([...lines, { product: "", qty: "1" }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouse) {
      setError("Pilih gudang.");
      return;
    }
    const parsed = lines
      .map((l) => ({ product: l.product, qty: Number(l.qty) }))
      .filter((l) => l.product && l.qty > 0);
    if (parsed.length === 0) {
      setError("Minimal satu baris produk valid.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createMovementDraft({
        movement_type: movementType,
        warehouse,
        notes,
        lines: parsed,
        post: Boolean(alsoPost && canPostNow),
      });
      router.push(`/inventory/movements/${created.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell title="Movement baru" subtitle="Buat draft lalu posting untuk mengubah stok.">
        <Link href="/inventory/movements" className="text-sm text-indigo-600 hover:underline">
          ← Kembali
        </Link>

        <form onSubmit={submit} className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <label className="block text-sm">
            Gudang
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Tipe
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as MovementType)}
            >
              <option value="IN">IN (masuk)</option>
              <option value="OUT">OUT (keluar)</option>
              <option value="ADJUSTMENT">ADJUSTMENT (koreksi ±)</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="RETURN">RETURN</option>
              <option value="DAMAGE">DAMAGE</option>
            </select>
          </label>

          <label className="block text-sm">
            Catatan
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div>
            <p className="text-sm font-medium text-slate-700">Baris produk</p>
            <div className="mt-2 space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <select
                    className="min-w-[200px] flex-1 rounded-lg border px-2 py-2 text-sm"
                    value={line.product}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], product: e.target.value };
                      setLines(next);
                    }}
                    required
                  >
                    <option value="">Pilih produk</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={movementType === "ADJUSTMENT" ? undefined : 0.0001}
                    step="any"
                    className="w-24 rounded-lg border px-2 py-2 text-sm"
                    value={line.qty}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], qty: e.target.value };
                      setLines(next);
                    }}
                    required
                  />
                  <button type="button" onClick={() => removeLine(i)} className="p-2 text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLine}
              className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600"
            >
              <Plus className="h-4 w-4" /> Tambah baris
            </button>
          </div>

          {canPostNow ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alsoPost} onChange={(e) => setAlsoPost(e.target.checked)} />
              Langsung post setelah simpan
            </label>
          ) : (
            <p className="text-xs text-slate-500">Draft disimpan; supervisor/admin yang mem-posting.</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Menyimpan…" : "Simpan movement"}
          </button>
        </form>
      </InventoryShell>
    </InventoryGate>
  );
}
