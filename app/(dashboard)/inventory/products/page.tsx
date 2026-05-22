"use client";

import { useEffect, useState } from "react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchProducts, saveProduct } from "@/lib/inventory/client";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { InvProduct } from "@/lib/inventory/types";
import { formatIntegerId } from "@/lib/format-number";
import { Loader2, Plus, Search } from "lucide-react";

export default function InventoryProductsPage() {
  const user = pb.authStore.model;
  const canEdit = user && canManageInventoryMaster(user);
  const [items, setItems] = useState<InvProduct[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ sku: "", barcode: "", name: "", uom: "pcs", min_stock: "0" });
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (search = q) => {
    setLoading(true);
    try {
      const res = await fetchProducts({ q: search });
      setItems(res.items as unknown as InvProduct[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => {
    setEditId(null);
    setForm({ sku: "", barcode: "", name: "", uom: "pcs", min_stock: "0" });
    setError("");
    setModal(true);
  };

  const openEdit = (p: InvProduct) => {
    setEditId(p.id);
    setForm({
      sku: p.sku,
      barcode: p.barcode || "",
      name: p.name,
      uom: p.uom || "pcs",
      min_stock: String(p.min_stock ?? 0),
    });
    setError("");
    setModal(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      await saveProduct({
        id: editId || undefined,
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        name: form.name.trim(),
        uom: form.uom.trim() || "pcs",
        min_stock: Number(form.min_stock) || 0,
        is_active: true,
      });
      setModal(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell title="Master produk" subtitle="SKU, barcode, satuan, dan minimum stok.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
              placeholder="Cari SKU / nama / barcode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
          >
            Cari
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" /> Produk baru
            </button>
          ) : null}
        </div>

        {error && !modal ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Barcode</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3">Min</th>
                {canEdit ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Belum ada produk.
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.barcode || "—"}</td>
                    <td className="px-4 py-3">{p.name}</td>
                    <td className="px-4 py-3">{p.uom || "pcs"}</td>
                    <td className="px-4 py-3">{formatIntegerId(p.min_stock)}</td>
                    {canEdit ? (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="text-indigo-600 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form
              onSubmit={submit}
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-semibold">{editId ? "Edit produk" : "Produk baru"}</h3>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <div className="mt-4 space-y-3">
                <Field label="SKU" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} required />
                <Field label="Barcode" value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} />
                <Field label="Nama" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
                <Field label="Satuan" value={form.uom} onChange={(v) => setForm({ ...form, uom: v })} />
                <Field label="Min stok" value={form.min_stock} onChange={(v) => setForm({ ...form, min_stock: v })} />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2 text-sm">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </InventoryShell>
    </InventoryGate>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  );
}
