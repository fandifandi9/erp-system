"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package, Save } from "lucide-react";
import { getAssignedProductId, productLabel } from "@/lib/inventory/slot-product";
import {
  buildSlotCodeForRack,
  getRackDisplayName,
  parseSlotFromLocationCode,
  type RackLayout,
} from "@/lib/inventory/rack-layout";
import { getErrorMessage } from "@/lib/errors";
import type { InvLocation, InvProduct } from "@/lib/inventory/types";

type Props = {
  warehouseId: string;
  rack: InvLocation;
  canEdit: boolean;
};

function slotKey(level: string, slot: string) {
  return `${level}|${slot}`;
}

function findSlotForCell(
  slots: InvLocation[],
  rackCode: string,
  level: string,
  slot: string,
): InvLocation | undefined {
  const expected = buildSlotCodeForRack(rackCode, level, slot);
  return slots.find((s) => s.code === expected);
}

export function RackSlotProductMatrix({ warehouseId, rack, canEdit }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<InvLocation[]>([]);
  const [layout, setLayout] = useState<RackLayout | null>(null);
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [productQ, setProductQ] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");

  const loadProducts = useCallback(async (q: string) => {
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams({ perPage: "200" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/inventory/products?${params}`, { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; items?: InvProduct[]; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat produk");
      setProducts(json.items ?? []);
    } catch (err) {
      setProducts([]);
      setMessage(getErrorMessage(err, "Daftar produk gagal dimuat — login ulang."));
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/inventory/locations/slots?warehouse=${encodeURIComponent(warehouseId)}&rackCode=${encodeURIComponent(rack.code)}`,
        { credentials: "include" },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        slots?: InvLocation[];
        layout?: RackLayout;
        error?: string;
      };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat slot");
      setSlots(json.slots ?? []);
      setLayout(json.layout ?? null);
      const nextDraft: Record<string, string> = {};
      for (const s of json.slots ?? []) {
        const lv = s.level?.trim() || parseSlotFromLocationCode(s.code).level;
        const bn = s.bin?.trim() || parseSlotFromLocationCode(s.code).slot;
        if (lv && bn) nextDraft[slotKey(lv, bn)] = getAssignedProductId(s);
      }
      setDraft(nextDraft);
    } catch (err) {
      setMessage(getErrorMessage(err));
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, rack.code]);

  useEffect(() => {
    void load();
    void loadProducts("");
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [load, loadProducts]);

  useEffect(() => {
    const t = setTimeout(() => void loadProducts(productQ), 300);
    return () => clearTimeout(t);
  }, [productQ, loadProducts]);

  const saveCell = async (level: string, slot: string) => {
    const key = slotKey(level, slot);
    const productId = draft[key] ?? "";
    const parts = rack.code.split("-").filter(Boolean);
    const aisle = parts[0] ?? "";
    const rackSeg = parts[1] ?? "";

    setSavingKey(key);
    try {
      const res = await fetch("/api/inventory/locations/slot-assign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse: warehouseId,
          rackCode: rack.code,
          level,
          slot,
          aisle,
          rack: rackSeg,
          productId,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; slotCode?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal simpan");
      setMessage(
        productId
          ? `Produk disimpan di slot ${json.slotCode ?? buildSlotCodeForRack(rack.code, level, slot)}.`
          : `Slot ${level}/${slot} dikosongkan.`,
      );
      await load();
    } catch (err) {
      alert(getErrorMessage(err, "Gagal menyimpan produk di slot"));
    } finally {
      setSavingKey("");
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat slot rak…
      </p>
    );
  }

  if (!layout?.levels.length || !layout.slots.length) {
    return (
      <p className="text-sm text-amber-800">
        Rak <strong>{rack.code}</strong> belum punya tingkat/slot di data. Klik{" "}
        <strong>Simpan rak {rack.code}</strong> di form atas (isi tingkat & slot sama), lalu buka Produk
        lagi.
      </p>
    );
  }

  return (
    <div ref={rootRef} className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Package className="h-4 w-4 text-emerald-600" />
        Isi produk per slot — {rack.code}
        <span className="font-normal text-slate-500">({getRackDisplayName(rack)})</span>
      </h3>
      <p className="mt-1 text-xs text-slate-600">
        Pilih produk di tiap sel → klik <strong>Simpan</strong> di sel itu. Satu slot = satu produk di
        gudang ini.
      </p>

      <label className="mt-3 block text-xs text-slate-600">
        Cari produk (SKU / nama)
        <input
          className="mt-1 w-full max-w-md rounded-lg border px-3 py-2 text-sm"
          value={productQ}
          onChange={(e) => setProductQ(e.target.value)}
          placeholder="Ketik SKU atau nama…"
          disabled={!canEdit}
        />
      </label>
      {loadingProducts ? (
        <p className="mt-1 text-xs text-slate-500">Memuat daftar produk…</p>
      ) : products.length === 0 ? (
        <p className="mt-1 text-xs text-amber-800">
          Tidak ada produk aktif. Buat produk di master ERP/inventory dulu, atau login ulang.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">{products.length} produk siap dipilih</p>
      )}

      {message ? <p className="mt-2 text-sm font-medium text-green-700">{message}</p> : null}

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-slate-200 bg-white px-2 py-2 text-left">Tingkat \\ Slot</th>
              {layout.slots.map((sl) => (
                <th key={sl} className="border border-slate-200 bg-white px-2 py-2 font-mono">
                  {sl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layout.levels.map((lv) => (
              <tr key={lv}>
                <td className="border border-slate-200 bg-slate-50 px-2 py-2 font-mono font-semibold">
                  {lv}
                </td>
                {layout.slots.map((sl) => {
                  const key = slotKey(lv, sl);
                  const loc = findSlotForCell(slots, rack.code, lv, sl);
                  const saving = savingKey === key;
                  const assigned = loc ? getAssignedProductId(loc) : draft[key];
                  return (
                    <td key={key} className="min-w-[160px] border border-slate-200 bg-white p-2 align-top">
                      <p className="mb-1 font-mono text-[10px] font-semibold text-indigo-700">
                        {loc?.code ?? buildSlotCodeForRack(rack.code, lv, sl)}
                      </p>
                      {canEdit ? (
                        <>
                          <select
                            className="w-full rounded border px-1 py-1.5 text-xs"
                            value={draft[key] ?? ""}
                            disabled={products.length === 0}
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          >
                            <option value="">— Kosong —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} — {p.name}
                              </option>
                            ))}
                          </select>
                          {assigned && !draft[key] ? (
                            <p className="mt-0.5 text-[10px] text-emerald-700">Sudah: {productLabel(loc?.expand?.assigned_product)}</p>
                          ) : null}
                          <button
                            type="button"
                            disabled={saving || products.length === 0}
                            onClick={() => void saveCell(lv, sl)}
                            className="mt-1.5 w-full rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                          >
                            {saving ? (
                              <span className="inline-flex items-center justify-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Menyimpan…
                              </span>
                            ) : (
                              "Simpan slot ini"
                            )}
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-700">
                          {productLabel(loc?.expand?.assigned_product) || "—"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
