"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import {
  upsertProductSkuFee,
  bulkUpsertProductSkuFees,
  isProductFeeLine,
} from "@/lib/bisnis/mp-template-client";
import type { MpFeeTemplateLine } from "@/lib/bisnis/types";
import { formatIdDecimal, parseIdDecimal } from "@/lib/format-id-number";
import { getErrorMessage } from "@/lib/errors";

const INPUT_CLS =
  "w-full min-h-[34px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category?: string;
  expand?: { category?: { id: string; name: string } };
};

type Props = {
  templateId: string;
  koleksiLabel: string;
  products: ProductRow[];
  lines: MpFeeTemplateLine[];
  categories: { id: string; name: string }[];
  onUpdated: (lines: MpFeeTemplateLine[]) => void;
};

function savedRate(line: MpFeeTemplateLine | undefined): number | null {
  if (line?.rate == null) return null;
  return line.rate;
}

export default function ProductSkuFeeTable({
  templateId,
  koleksiLabel,
  products,
  lines,
  categories,
  onUpdated,
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const productLines = useMemo(() => lines.filter(isProductFeeLine), [lines]);

  const lineByProduct = useMemo(() => {
    const map = new Map<string, MpFeeTemplateLine>();
    for (const l of productLines) {
      if (l.scope_product) map.set(l.scope_product, l);
    }
    return map;
  }, [productLines]);

  const filtered = useMemo(
    () => products.filter((p) => !categoryFilter || p.category === categoryFilter),
    [products, categoryFilter],
  );

  const setDraft = (productId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [productId]: value }));
    setSavedFlash(false);
  };

  const rateDisplay = (productId: string): string => {
    if (drafts[productId] !== undefined) return drafts[productId];
    const line = lineByProduct.get(productId);
    return line?.rate != null ? formatIdDecimal(line.rate) : "";
  };

  const isDirty = (productId: string): boolean => {
    const raw = rateDisplay(productId);
    const saved = savedRate(lineByProduct.get(productId));
    if (!raw.trim()) return saved != null;
    const parsed = parseIdDecimal(raw);
    if (!Number.isFinite(parsed)) return true;
    return saved !== parsed;
  };

  const dirtyCount = useMemo(
    () => filtered.filter((p) => isDirty(p.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, drafts, lineByProduct],
  );

  const configuredCount = productLines.length;

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 3500);
  };

  const saveProduct = async (product: ProductRow) => {
    const raw = rateDisplay(product.id);
    const rate = raw.trim() ? parseIdDecimal(raw) : 0;
    if (raw.trim() && !Number.isFinite(rate)) {
      alert("Rate (%) tidak valid. Contoh: 10,2");
      return;
    }

    setSavingId(product.id);
    try {
      const fresh = await upsertProductSkuFee(
        templateId,
        { id: product.id, sku: product.sku, name: product.name },
        rate,
        lines,
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      onUpdated(fresh);
      flashSaved();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal simpan fee SKU"));
    } finally {
      setSavingId(null);
    }
  };

  const saveAllToKoleksi = async () => {
    const items: { product: ProductRow; rate: number }[] = [];
    for (const p of filtered) {
      const raw = rateDisplay(p.id);
      if (!raw.trim() && !lineByProduct.has(p.id)) continue;
      const rate = raw.trim() ? parseIdDecimal(raw) : 0;
      if (raw.trim() && !Number.isFinite(rate)) {
        alert(`Rate SKU ${p.sku} tidak valid. Contoh: 10,2`);
        return;
      }
      if (!isDirty(p.id)) continue;
      items.push({ product: p, rate });
    }

    if (items.length === 0) {
      alert("Tidak ada perubahan fee untuk disimpan.");
      return;
    }

    setBulkSaving(true);
    try {
      const fresh = await bulkUpsertProductSkuFees(templateId, items, lines);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const { product } of items) delete next[product.id];
        return next;
      });
      onUpdated(fresh);
      flashSaved();
    } catch (e: unknown) {
      alert(
        getErrorMessage(e, "Gagal simpan fee ke koleksi") +
          "\n\nPastikan PocketBase punya line_group `product` dan field `scope_product`. Jalankan: node scripts/fix-pb-fee-lines-schema.mjs",
      );
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-violet-50/80 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-violet-950">Biaya per SKU produk</h4>
              {savedFlash && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Tersimpan di koleksi
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-violet-800/80">
              Fee melekat ke koleksi <strong>{koleksiLabel}</strong>. SKU dikunci — saat import, SKU menentukan
              rate komisi. {configuredCount} dari {products.length} produk sudah di-set.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              disabled={bulkSaving || dirtyCount === 0}
              onClick={saveAllToKoleksi}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {dirtyCount > 0 ? `Simpan ke koleksi (${dirtyCount})` : "Simpan ke koleksi"}
            </button>
            <label className="w-full text-xs sm:w-48">
              <span className="mb-1 block font-medium text-slate-600">Filter kategori</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">Semua kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="py-2 font-medium">Nama produk</th>
              <th className="py-2 font-medium">Kategori</th>
              <th className="w-28 py-2 font-medium">Fee (%)</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                  Tidak ada produk{categoryFilter ? " di kategori ini" : ""}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const hasFee = lineByProduct.has(p.id);
                const dirty = isDirty(p.id);
                const busy = savingId === p.id || bulkSaving;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/80 ${dirty ? "bg-amber-50/40" : ""}`}
                  >
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-indigo-800">{p.sku}</td>
                    <td className="py-2 text-slate-800">{p.name}</td>
                    <td className="py-2 text-xs text-slate-500">{p.expand?.category?.name ?? "—"}</td>
                    <td className="py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="10,2"
                        value={rateDisplay(p.id)}
                        onChange={(e) => setDraft(p.id, e.target.value)}
                        onBlur={() => {
                          if (isDirty(p.id)) saveProduct(p);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveProduct(p);
                        }}
                        className={`${INPUT_CLS} ${
                          dirty
                            ? "border-amber-400 bg-amber-50/50"
                            : hasFee
                              ? "border-emerald-300 bg-emerald-50/30"
                              : ""
                        }`}
                      />
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <button
                        type="button"
                        title="Simpan fee SKU"
                        disabled={busy || !dirty}
                        onClick={() => saveProduct(p)}
                        className="rounded p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40"
                      >
                        {busy && savingId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        Isi fee lalu klik <strong>Simpan ke koleksi</strong> — data tersimpan di template{" "}
        <strong>{koleksiLabel}</strong> dan dipakai saat mapping toko (tab ④). Kosongkan fee lalu simpan = hapus
        rate SKU. Tier lain = koleksi terpisah.
      </p>
    </div>
  );
}
