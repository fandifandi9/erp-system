"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2, Upload } from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  WmsBadge,
  WmsCard,
  WmsFlowBar,
  WmsPrimaryButton,
  WmsSecondaryButton,
  WmsSectionTitle,
} from "@/components/wms/ui";
import { WMS_FLOW_STEPS } from "@/lib/wms/navigation";
import { createMovementDraft, fetchWarehouses, saveMediaFile } from "@/lib/inventory/client";
import { fetchMasterProducts, resolveProductByScan } from "@/lib/wms/product-master";
import { getErrorMessage } from "@/lib/errors";
import type { InvWarehouse } from "@/lib/inventory/types";
import type { MasterProductView } from "@/lib/wms/product-master";

type Line = { product: string; sku: string; name: string; qty: string };

export default function WmsReceivingPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [products, setProducts] = useState<MasterProductView[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [supplier, setSupplier] = useState("");
  const [poRef, setPoRef] = useState("");
  const [qcStatus, setQcStatus] = useState<"pending" | "pass" | "fail">("pending");
  const [barcode, setBarcode] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [detailOpen, setDetailOpen] = useState(true);

  useEffect(() => {
    void Promise.all([fetchWarehouses(), fetchMasterProducts()]).then(([w, p]) => {
      setWarehouses(w);
      setProducts(p);
      if (w[0]) setWarehouse(w[0].id);
    });
  }, []);

  const addProduct = useCallback(
    async (code: string) => {
      const q = code.trim();
      if (!q) return;
      const hit =
        products.find(
          (p) =>
            p.sku?.toLowerCase() === q.toLowerCase() ||
            p.barcode?.toLowerCase() === q.toLowerCase() ||
            p.id === code,
        ) || (await resolveProductByScan(q));
      if (!hit) {
        setError(`Barcode/SKU tidak valid di master produk: ${code}`);
        return;
      }
      setLines((prev) => {
        const ex = prev.find((l) => l.product === hit.id);
        if (ex) {
          return prev.map((l) =>
            l.product === hit.id ? { ...l, qty: String(Number(l.qty) + 1) } : l
          );
        }
        return [...prev, { product: hit.id, sku: hit.sku, name: hit.name, qty: "1" }];
      });
      setBarcode("");
      setError("");
    },
    [products]
  );

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setPhotos((prev) => [...prev, ...Array.from(files).filter((f) => f.type.startsWith("image/"))]);
  };

  const submit = async () => {
    if (!warehouse) {
      setError("Pilih gudang.");
      return;
    }
    const parsed = lines
      .map((l) => ({ product: l.product, qty: Number(l.qty) }))
      .filter((l) => l.product && l.qty > 0);
    if (parsed.length === 0) {
      setError("Minimal satu baris produk.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const notes = [
        "[RECEIVING]",
        supplier && `Supplier: ${supplier}`,
        poRef && `PO: ${poRef}`,
        `QC: ${qcStatus}`,
      ]
        .filter(Boolean)
        .join(" · ");

      const created = await createMovementDraft({
        movement_type: "IN",
        warehouse,
        notes,
        lines: parsed,
        post: false,
      });

      for (const file of photos) {
        try {
          await saveMediaFile({
            storage_root: "D:\\ERP_MEDIA",
            relative_path: `receiving/${created.id}/${file.name}`,
            original_filename: file.name,
            mime_type: file.type || "image/jpeg",
            entity_type: "receiving",
            entity_id: created.id,
            warehouse,
          });
        } catch {
          /* metadata opsional */
        }
      }

      router.push(`/inventory/movements/${created.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title="Penerimaan barang"
        subtitle="Goods receipt — foto dokumentasi, referensi PO, dan draf mutasi masuk."
        module="wms"
      >
        <WmsCard padding="p-4">
          <WmsFlowBar steps={WMS_FLOW_STEPS} activeIndex={1} />
        </WmsCard>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <WmsCard className="!border-blue-200 !bg-blue-50/90">
          <p className="text-sm text-blue-950">
            <strong>Stok masuk utama:</strong> gunakan{" "}
            <a href="/bisnis/pembelian/buat" className="font-semibold text-indigo-700 underline">
              Bisnis → Pembelian
            </a>
            . Saldo gudang diambil dari <code className="text-xs">inv_stock_balances</code> (bukan angka
            hardcode). Penerimaan WMS ini hanya draf mutasi manual — harus di-post terpisah.
          </p>
        </WmsCard>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <WmsCard>
              <WmsSectionTitle
                title="Informasi penerimaan"
                action={
                  <button
                    type="button"
                    className="text-xs font-medium text-indigo-600"
                    onClick={() => setDetailOpen((v) => !v)}
                  >
                    {detailOpen ? "Tutup" : "Buka"}
                  </button>
                }
              />
              {detailOpen ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Gudang</span>
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Supplier</span>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      placeholder="Nama supplier"
                    />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-slate-700">Referensi PO</span>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                      value={poRef}
                      onChange={(e) => setPoRef(e.target.value)}
                      placeholder="PO-2026-001"
                    />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-slate-700">Status QC awal</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(
                        [
                          ["pending", "Menunggu"],
                          ["pass", "Lulus"],
                          ["fail", "Gagal"],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setQcStatus(v)}
                          className={
                            "rounded-xl px-4 py-2 text-sm font-medium ring-1 transition " +
                            (qcStatus === v
                              ? "bg-indigo-600 text-white ring-indigo-600"
                              : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
              ) : null}
            </WmsCard>

            <WmsCard>
              <WmsSectionTitle title="Scan & baris produk" subtitle="Scan barcode atau pilih SKU" />
              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                  placeholder="Scan / ketik barcode atau SKU"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addProduct(barcode);
                    }
                  }}
                />
                <WmsSecondaryButton onClick={() => void addProduct(barcode)}>Tambah</WmsSecondaryButton>
              </div>
              <ul className="mt-4 space-y-2">
                {lines.length === 0 ? (
                  <li className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-500">
                    Belum ada baris — scan produk untuk mulai.
                  </li>
                ) : (
                  lines.map((l, i) => (
                    <li
                      key={l.product}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-indigo-600">{l.sku}</p>
                        <p className="text-sm font-medium text-slate-900">{l.name}</p>
                      </div>
                      <input
                        type="number"
                        min={0.0001}
                        step="any"
                        className="w-24 rounded-lg border px-2 py-2 text-sm"
                        value={l.qty}
                        onChange={(e) => {
                          const next = [...lines];
                          next[i] = { ...next[i], qty: e.target.value };
                          setLines(next);
                        }}
                      />
                      <button
                        type="button"
                        className="p-2 text-red-600"
                        onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </WmsCard>
          </div>

          <div className="space-y-4">
            <WmsCard>
              <WmsSectionTitle title="Dokumentasi foto" subtitle="Drag & drop atau pilih file" />
              <div
                className={
                  "mt-4 flex min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition " +
                  (dragOver ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200 bg-slate-50/50")
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  onFiles(e.dataTransfer.files);
                }}
              >
                <Upload className="h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm text-slate-600">Letakkan foto di sini</p>
                <label className="mt-3 cursor-pointer">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-indigo-600 shadow-sm ring-1 ring-slate-200">
                    <Camera className="h-3.5 w-3.5" /> Pilih foto
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onFiles(e.target.files)}
                  />
                </label>
              </div>
              {photos.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                  {photos.map((f, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <button type="button" className="text-red-600" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                        Hapus
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </WmsCard>

            <WmsCard className="bg-gradient-to-br from-indigo-50/80 to-white">
              <p className="text-sm font-semibold text-slate-800">Simpan penerimaan</p>
              <p className="mt-1 text-xs text-slate-500">
                Membuat draf mutasi IN. Supervisor mem-posting untuk update stok.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <WmsPrimaryButton disabled={saving} onClick={() => void submit()}>
                  {saving ? "Menyimpan…" : "Simpan draf penerimaan"}
                </WmsPrimaryButton>
                <WmsSecondaryButton onClick={() => router.push("/wms")}>Batal</WmsSecondaryButton>
              </div>
            </WmsCard>
          </div>
        </div>
      </InventoryShell>
    </InventoryGate>
  );
}
