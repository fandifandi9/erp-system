"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Plus, Save, Search, Tag as TagIcon, X } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import {
  BISNIS_COLLECTIONS,
  type MpProductFee,
  type ProductTag,
} from "@/lib/bisnis/types";
import { formatIdDecimal, parseIdDecimal } from "@/lib/format-id-number";
import { getErrorMessage } from "@/lib/errors";
import type { ProductRow } from "./ProductSkuFeeTable";

const INPUT_CLS =
  "w-full min-h-[34px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

type Draft = { fee?: string; aff?: string };

function fmtRp(n: number): string {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`;
}

function specLabel(prefix: "mp" | "aff", row: MpProductFee): string {
  const calc = prefix === "mp" ? row.mp_calc_type : row.aff_calc_type;
  const rate = prefix === "mp" ? row.mp_rate : row.aff_rate;
  const max = prefix === "mp" ? row.mp_max_amount : row.aff_max_amount;
  const fixed = prefix === "mp" ? row.mp_fixed_amount : row.aff_fixed_amount;
  switch (calc) {
    case "percent_cap":
      return `${rate ?? 0}% max ${fmtRp(max ?? 0)}`;
    case "fixed":
      return `${fmtRp(fixed ?? 0)}/item`;
    default:
      return "";
  }
}

async function apiCall<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error || "Permintaan gagal.");
  return data;
}

/**
 * Fee per SKU (Fee Engine: marketplace + tier + SKU).
 * Semua mulai dari 0 — kosong berarti tidak ada potongan. Tanpa nilai default.
 * Tag dibuat/dipasang langsung di kolom SKU. Pencarian: SKU / nama / tag.
 */
export default function SkuEngineFeeTable({
  tierId,
  koleksiLabel,
  products,
}: {
  tierId: string;
  koleksiLabel: string;
  products: ProductRow[];
}) {
  const [feeByProduct, setFeeByProduct] = useState<Map<string, MpProductFee>>(new Map());
  const [tags, setTags] = useState<ProductTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [search, setSearch] = useState("");
  const [feeFilter, setFeeFilter] = useState<"all" | "unset" | "set">("all");
  const [tagEditorFor, setTagEditorFor] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);

  const loadFees = useCallback(async () => {
    if (!tierId) return;
    const esc = tierId.replace(/"/g, '\\"');
    const rows = await pb.collection(BISNIS_COLLECTIONS.mpProductFees).getFullList<MpProductFee>({
      filter: `seller_tier = "${esc}"`,
      requestKey: null,
    });
    setFeeByProduct(new Map(rows.map((r) => [r.product, r])));
  }, [tierId]);

  const loadTags = useCallback(async () => {
    const rows = await pb.collection(BISNIS_COLLECTIONS.productTags).getFullList<ProductTag>({
      filter: "is_active = true",
      sort: "name",
      requestKey: null,
    });
    setTags(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        await Promise.all([loadFees(), loadTags()]);
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadError(getErrorMessage(e, "Gagal memuat fee engine. Pastikan collection PB sudah dibuat."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFees, loadTags]);

  /** Relasi PB lama bisa mengembalikan string tunggal — normalisasi ke array. */
  const tagProductIds = (t: ProductTag): string[] => {
    const v = t.products as unknown;
    if (Array.isArray(v)) return v as string[];
    if (typeof v === "string" && v) return [v];
    return [];
  };

  const tagsByProduct = useMemo(() => {
    const map = new Map<string, ProductTag[]>();
    for (const tag of tags) {
      for (const pid of tagProductIds(tag)) {
        const list = map.get(pid) ?? [];
        list.push(tag);
        map.set(pid, list);
      }
    }
    return map;
  }, [tags]);

  /** SKU dianggap "di-set" jika ada baris aktif dengan nilai > 0. */
  const isConfigured = useCallback(
    (productId: string): boolean => {
      const row = feeByProduct.get(productId);
      if (!row || !row.is_active) return false;
      return Boolean(
        (row.mp_rate ?? 0) > 0 ||
          (row.mp_fixed_amount ?? 0) > 0 ||
          (row.aff_rate ?? 0) > 0 ||
          (row.aff_fixed_amount ?? 0) > 0,
      );
    },
    [feeByProduct],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return products.filter((p) => {
      if (feeFilter === "unset" && isConfigured(p.id)) return false;
      if (feeFilter === "set" && !isConfigured(p.id)) return false;
      if (!s) return true;
      if (p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)) return true;
      return (tagsByProduct.get(p.id) ?? []).some((t) => t.name.toLowerCase().includes(s));
    });
  }, [products, search, tagsByProduct, feeFilter, isConfigured]);

  // ─── Fee ───

  const feeDisplay = (productId: string): string => {
    const d = drafts[productId];
    if (d?.fee !== undefined) return d.fee;
    const row = feeByProduct.get(productId);
    if (row && row.is_active && row.mp_calc_type === "percent" && row.mp_rate) {
      return formatIdDecimal(row.mp_rate);
    }
    return "";
  };

  const affDisplay = (productId: string): string => {
    const d = drafts[productId];
    if (d?.aff !== undefined) return d.aff;
    const row = feeByProduct.get(productId);
    if (row && row.is_active && row.aff_calc_type === "percent" && row.aff_rate) {
      return formatIdDecimal(row.aff_rate);
    }
    return "";
  };

  const setDraft = (productId: string, patch: Draft) => {
    setDrafts((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
    setSavedFlash(false);
  };

  /** Baris memakai tipe lanjutan (persen+max / nominal) → edit di halaman Fee per SKU. */
  const isAdvanced = (row: MpProductFee | undefined): boolean => {
    if (!row || !row.is_active) return false;
    const mpAdv = row.mp_calc_type !== "percent";
    const affAdv =
      row.aff_calc_type !== "percent" && row.aff_calc_type !== "inherit" && row.aff_calc_type !== "none";
    return mpAdv || affAdv;
  };

  const isDirty = (productId: string): boolean => {
    const d = drafts[productId];
    if (!d) return false;
    const row = feeByProduct.get(productId);
    const savedFee =
      row && row.is_active && row.mp_calc_type === "percent" && row.mp_rate
        ? formatIdDecimal(row.mp_rate)
        : "";
    const savedAff =
      row && row.is_active && row.aff_calc_type === "percent" && row.aff_rate
        ? formatIdDecimal(row.aff_rate)
        : "";
    const curFee = d.fee !== undefined ? d.fee : savedFee;
    const curAff = d.aff !== undefined ? d.aff : savedAff;
    return curFee.trim() !== savedFee.trim() || curAff.trim() !== savedAff.trim();
  };

  const dirtyIds = useMemo(
    () => filtered.filter((p) => isDirty(p.id)).map((p) => p.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, drafts, feeByProduct],
  );

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 3500);
  };

  const saveOne = async (product: ProductRow): Promise<boolean> => {
    const feeRaw = feeDisplay(product.id).trim();
    const affRaw = affDisplay(product.id).trim();
    const row = feeByProduct.get(product.id);

    // Kosong dua-duanya = hapus baris → SKU kembali 0 (tanpa potongan).
    if (!feeRaw && !affRaw) {
      if (row) await apiCall(`/api/bisnis/mp-fees/product-fees/${row.id}`, { method: "DELETE" });
      return true;
    }

    const fee = feeRaw ? parseIdDecimal(feeRaw) : 0;
    if (!Number.isFinite(fee) || fee < 0) {
      alert(`SKU ${product.sku}: Fee (%) tidak valid. Contoh: 10,2`);
      return false;
    }
    const aff = affRaw ? parseIdDecimal(affRaw) : 0;
    if (!Number.isFinite(aff) || aff < 0) {
      alert(`SKU ${product.sku}: Affiliate (%) tidak valid. Contoh: 10`);
      return false;
    }

    await apiCall("/api/bisnis/mp-fees/product-fees", {
      method: "POST",
      body: JSON.stringify({
        seller_tier: tierId,
        product: product.id,
        mp_calc_type: "percent",
        mp_rate: fee,
        aff_calc_type: aff > 0 ? "percent" : "none",
        aff_rate: aff,
      }),
    });
    return true;
  };

  const clearDraft = (productId: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const saveProduct = async (product: ProductRow) => {
    setSavingId(product.id);
    try {
      const ok = await saveOne(product);
      if (ok) {
        clearDraft(product.id);
        await loadFees();
        flashSaved();
      }
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal simpan fee SKU"));
    } finally {
      setSavingId(null);
    }
  };

  const saveAll = async () => {
    const targets = filtered.filter((p) => isDirty(p.id));
    if (targets.length === 0) {
      alert("Tidak ada perubahan untuk disimpan.");
      return;
    }
    setBulkSaving(true);
    try {
      for (const p of targets) {
        const ok = await saveOne(p);
        if (!ok) {
          setBulkSaving(false);
          return;
        }
        clearDraft(p.id);
      }
      await loadFees();
      flashSaved();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal simpan fee SKU"));
    } finally {
      setBulkSaving(false);
    }
  };

  // ─── Tag inline (maks. 1 tag per SKU) ───

  const addTagToProduct = async (productId: string, tag: ProductTag) => {
    if ((tagsByProduct.get(productId) ?? []).length > 0) return;
    setTagBusy(true);
    try {
      await apiCall(`/api/bisnis/mp-fees/tags/${tag.id}`, {
        method: "PATCH",
        body: JSON.stringify({ add_products: [productId] }),
      });
      setTagInput("");
      setTagEditorFor(null);
      await loadTags();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal menambah tag"));
    } finally {
      setTagBusy(false);
    }
  };

  const createTagForProduct = async (productId: string, name: string) => {
    if (!name.trim()) return;
    if ((tagsByProduct.get(productId) ?? []).length > 0) return;
    setTagBusy(true);
    try {
      await apiCall("/api/bisnis/mp-fees/tags", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), products: [productId] }),
      });
      setTagInput("");
      setTagEditorFor(null);
      await loadTags();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal membuat tag"));
    } finally {
      setTagBusy(false);
    }
  };

  const removeTagFromProduct = async (productId: string, tag: ProductTag) => {
    setTagBusy(true);
    try {
      await apiCall(`/api/bisnis/mp-fees/tags/${tag.id}`, {
        method: "PATCH",
        body: JSON.stringify({ remove_products: [productId] }),
      });
      await loadTags();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal menghapus tag"));
    } finally {
      setTagBusy(false);
    }
  };

  const tagSuggestions = (productId: string): ProductTag[] => {
    const owned = new Set((tagsByProduct.get(productId) ?? []).map((t) => t.id));
    const s = tagInput.trim().toLowerCase();
    return tags
      .filter((t) => !owned.has(t.id) && (!s || t.name.toLowerCase().includes(s)))
      .slice(0, 8);
  };

  const exactTagExists = (name: string): boolean =>
    tags.some((t) => t.name.toLowerCase() === name.trim().toLowerCase());

  const configuredCount = useMemo(
    () => products.filter((p) => isConfigured(p.id)).length,
    [products, isConfigured],
  );

  if (!tierId) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-violet-50/80 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-violet-950">Fee per SKU — marketplace & affiliate</h4>
              {savedFlash && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Tersimpan
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-violet-800/80">
              Berlaku untuk <strong>{koleksiLabel}</strong>. Semua mulai dari 0 — kosong = tanpa potongan.{" "}
              {configuredCount} SKU di-set.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              disabled={bulkSaving || dirtyIds.length === 0}
              onClick={() => void saveAll()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {dirtyIds.length > 0 ? `Simpan (${dirtyIds.length})` : "Simpan"}
            </button>
            <label className="relative w-full text-xs sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU / nama produk / tag…"
                className={`${INPUT_CLS} pl-8`}
              />
            </label>
            <div className="flex overflow-hidden rounded-lg border border-violet-200 text-[11px] font-medium">
              {(
                [
                  ["all", `Semua (${products.length})`],
                  ["unset", `Belum di-set (${products.length - configuredCount})`],
                  ["set", `Sudah di-set (${configuredCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFeeFilter(key)}
                  className={`px-2.5 py-1 ${
                    feeFilter === key
                      ? "bg-violet-600 text-white"
                      : "bg-white text-violet-700 hover:bg-violet-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{loadError}</div>
      )}

      <div className="max-h-[420px] overflow-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">SKU & tag</th>
                <th className="py-2 font-medium">Nama produk</th>
                <th className="w-28 py-2 font-medium">Fee (%)</th>
                <th className="w-28 py-2 font-medium">Affiliate (%)</th>
                <th className="w-16 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                    Tidak ada produk yang cocok{search ? ` dengan "${search}"` : ""}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const row = feeByProduct.get(p.id);
                  const advanced = isAdvanced(row);
                  const dirty = isDirty(p.id);
                  const busy = savingId === p.id || bulkSaving;
                  const pTags = tagsByProduct.get(p.id) ?? [];
                  const tagOpen = tagEditorFor === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-50 hover:bg-slate-50/80 ${dirty ? "bg-amber-50/40" : ""}`}
                    >
                      <td className="relative px-4 py-2 align-top">
                        <p className="font-mono text-xs font-semibold text-indigo-800">{p.sku}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {pTags.map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
                            >
                              <button
                                type="button"
                                onClick={() => setSearch(t.name)}
                                title={`Filter tag ${t.name}`}
                                className="hover:underline"
                              >
                                {t.name}
                              </button>
                              <button
                                type="button"
                                disabled={tagBusy}
                                onClick={() => void removeTagFromProduct(p.id, t)}
                                title="Lepas tag dari SKU ini"
                                className="text-indigo-400 hover:text-red-600"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                          {pTags.length === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setTagEditorFor(tagOpen ? null : p.id);
                                setTagInput("");
                              }}
                              title="Tambah tag (maks. 1 per SKU)"
                              className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                            >
                              <Plus className="h-2.5 w-2.5" /> tag
                            </button>
                          )}
                        </div>
                        {tagOpen && pTags.length === 0 && (
                          <div className="absolute left-4 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                            <input
                              autoFocus
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setTagEditorFor(null);
                                if (e.key === "Enter" && tagInput.trim() && !exactTagExists(tagInput)) {
                                  void createTagForProduct(p.id, tagInput);
                                }
                              }}
                              placeholder="Cari / buat tag…"
                              className={`${INPUT_CLS} text-xs`}
                            />
                            <div className="mt-1 max-h-36 overflow-y-auto">
                              {tagSuggestions(p.id).map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  disabled={tagBusy}
                                  onClick={() => void addTagToProduct(p.id, t)}
                                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-indigo-50"
                                >
                                  <TagIcon className="h-3 w-3 text-indigo-500" />
                                  {t.name}
                                  <span className="ml-auto text-[10px] text-slate-400">
                                    {tagProductIds(t).length} SKU
                                  </span>
                                </button>
                              ))}
                              {tagInput.trim() && !exactTagExists(tagInput) && (
                                <button
                                  type="button"
                                  disabled={tagBusy}
                                  onClick={() => void createTagForProduct(p.id, tagInput)}
                                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Plus className="h-3 w-3" /> Buat tag “{tagInput.trim()}”
                                </button>
                              )}
                              {tagSuggestions(p.id).length === 0 && !tagInput.trim() && (
                                <p className="px-2 py-1 text-[11px] text-slate-400">
                                  Ketik nama tag baru lalu Enter.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2 align-top text-slate-800">{p.name}</td>
                      {advanced && row ? (
                        <td colSpan={2} className="py-2 align-top text-xs text-slate-600">
                          {specLabel("mp", row) && <span>MP: {specLabel("mp", row)} </span>}
                          {specLabel("aff", row) && <span>· Aff: {specLabel("aff", row)}</span>}
                          <span className="block text-[10px] text-slate-400">
                            Tipe lanjutan — ubah di halaman Fee per SKU
                          </span>
                        </td>
                      ) : (
                        <>
                          <td className="py-2 pr-2 align-top">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={feeDisplay(p.id)}
                              onChange={(e) => setDraft(p.id, { fee: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveProduct(p);
                              }}
                              className={`${INPUT_CLS} ${
                                dirty
                                  ? "border-amber-400 bg-amber-50/50"
                                  : row?.is_active
                                    ? "border-emerald-300 bg-emerald-50/30"
                                    : ""
                              }`}
                            />
                          </td>
                          <td className="py-2 pr-2 align-top">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={affDisplay(p.id)}
                              onChange={(e) => setDraft(p.id, { aff: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveProduct(p);
                              }}
                              className={`${INPUT_CLS} ${dirty ? "border-amber-400 bg-amber-50/50" : ""}`}
                            />
                          </td>
                        </>
                      )}
                      <td className="py-2 pr-2 text-right align-top">
                        <button
                          type="button"
                          title="Simpan fee SKU"
                          disabled={busy || !dirty}
                          onClick={() => void saveProduct(p)}
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
        )}
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        Kosongkan kedua kolom lalu simpan = fee SKU dihapus (kembali 0). Klik nama tag = filter. Maks. 1 tag
        per SKU — lepas (×) dulu untuk mengganti. Tag dipakai untuk pencarian & bulk update — tidak ikut
        hitung fee.
      </p>
    </div>
  );
}
