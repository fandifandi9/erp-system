"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Sparkles, Package, CheckCircle2, Star } from "lucide-react";
import {
  getOrCreateTemplateForTier,
  fetchMpFeeTemplateLines,
  createMpFeeTemplateLine,
  updateMpFeeTemplateLine,
  deleteMpFeeTemplateLine,
  deleteMpFeeTemplate,
  ensureDefaultFeeLines,
  tierBundleLabel,
  buildMpFeeLinePayload,
  mpFeeLineFormDefaults,
  mpFeeLineFormFromRecord,
  parseMpFeeLineForm,
  type MpFeeLineFormState,
} from "@/lib/bisnis/mp-template-client";
import { formatIdDecimal, formatIdInteger, parseIdDecimal, parseIdInteger } from "@/lib/format-id-number";
import type { MpFeeTemplate, MpFeeTemplateLine, MpSellerTier, MpTemplateLineGroup, SalesChannel } from "@/lib/bisnis/types";
import ProductSkuFeeTable, { type ProductRow } from "./ProductSkuFeeTable";
import { getErrorMessage } from "@/lib/errors";

const INPUT_CLS =
  "w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

type Category = { id: string; name: string };

type Props = {
  channels: SalesChannel[];
  tiers: MpSellerTier[];
  categories: Category[];
  products: ProductRow[];
  feeTemplates: MpFeeTemplate[];
  onChanged?: () => void;
};

const EMPTY_LINE = mpFeeLineFormDefaults();

function formatBlurText(mode: "integer" | "decimal", raw: string): string {
  if (!raw.trim()) return "";
  const n = mode === "integer" ? parseIdInteger(raw) : parseIdDecimal(raw);
  if (!Number.isFinite(n)) return raw;
  return mode === "integer" ? formatIdInteger(Math.round(n)) : formatIdDecimal(n);
}

export default function MpFeeBundleEditor({ channels, tiers, categories, products, feeTemplates, onChanged }: Props) {
  const [selectedTierId, setSelectedTierId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [lines, setLines] = useState<MpFeeTemplateLine[]>([]);
  const [lineCounts, setLineCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [lineModal, setLineModal] = useState<"add" | "edit" | null>(null);
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState<MpFeeLineFormState>(EMPTY_LINE);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const selectedTier = tiers.find((t) => t.id === selectedTierId);
  const platform = channels.find((c) => c.id === selectedTier?.channel);

  const koleksiList = useMemo(() => {
    return tiers.map((tier) => {
      const ch = channels.find((c) => c.id === tier.channel);
      const tpl = feeTemplates.find((t) => t.channel === tier.channel && t.seller_tier === tier.id) ?? null;
      return {
        tierId: tier.id,
        label: tierBundleLabel(ch?.name ?? "?", tier.label),
        template: tpl,
        lineCount: tpl ? (lineCounts[tpl.id] ?? 0) : 0,
      };
    });
  }, [tiers, channels, feeTemplates, lineCounts]);

  const currentKoleksi = koleksiList.find((k) => k.tierId === selectedTierId);

  useEffect(() => {
    if (feeTemplates.length === 0) return;
    (async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        feeTemplates.map(async (t) => {
          try {
            counts[t.id] = (await fetchMpFeeTemplateLines(t.id)).length;
          } catch {
            counts[t.id] = 0;
          }
        }),
      );
      setLineCounts(counts);
    })();
  }, [feeTemplates]);

  const loadBundle = useCallback(async (tierId: string) => {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
    const ch = channels.find((c) => c.id === tier.channel);
    if (!ch) return;

    setLoading(true);
    try {
      const tpl = await getOrCreateTemplateForTier(ch.id, tier.id, ch.name, tier.label);
      setTemplateId(tpl.id);
      const rows = await fetchMpFeeTemplateLines(tpl.id);
      setLines(rows);
      setLineCounts((prev) => ({ ...prev, [tpl.id]: rows.length }));
      onChanged?.();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [channels, tiers, onChanged]);

  useEffect(() => {
    if (selectedTierId) loadBundle(selectedTierId);
    else {
      setTemplateId("");
      setLines([]);
    }
  }, [selectedTierId, loadBundle]);

  useEffect(() => {
    if (!selectedTierId && tiers[0]) setSelectedTierId(tiers[0].id);
  }, [tiers, selectedTierId]);

  const mpFeeRows = lines.filter((l) => l.line_group === "mp_fee");
  const opRows = lines.filter((l) => l.line_group === "operational");

  const handleSeedDefaults = async () => {
    if (!templateId) return;
    setSeeding(true);
    try {
      await ensureDefaultFeeLines(templateId);
      setLines(await fetchMpFeeTemplateLines(templateId));
      onChanged?.();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setSeeding(false);
    }
  };

  const openAddFee = (preset?: Partial<MpFeeLineFormState & { rate?: number; max_amount?: number; fixed_amount?: number }>) => {
    setEditLineId(null);
    setLineForm(
      mpFeeLineFormDefaults({
        ...preset,
        sort_order: (lines.length + 1) * 10,
      }),
    );
    setLineModal("add");
  };

  const openEditLine = (row: MpFeeTemplateLine) => {
    setEditLineId(row.id);
    setLineForm(mpFeeLineFormFromRecord(row));
    setLineModal("edit");
  };

  const handleSaveLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateId || saving) return;

    const parsed = parseMpFeeLineForm(lineForm);
    if (!parsed.ok) {
      alert(parsed.message);
      return;
    }

    setSaving(true);
    try {
      const existingCodes = lines.filter((l) => l.id !== editLineId).map((l) => l.code);
      const payload = buildMpFeeLinePayload(templateId, parsed.data, {
        existingCodes: editLineId ? undefined : existingCodes,
      });
      if (editLineId) await updateMpFeeTemplateLine(editLineId, payload);
      else await createMpFeeTemplateLine(payload);
      setLineModal(null);
      const fresh = await fetchMpFeeTemplateLines(templateId);
      setLines(fresh);
      setLineCounts((prev) => ({ ...prev, [templateId]: fresh.length }));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
      onChanged?.();
    } catch (err: unknown) {
      alert(
        getErrorMessage(err, "Gagal menyimpan biaya") +
          "\n\nJika error berlanjut, cek field collection biz_mp_fee_template_lines di PocketBase (lihat POCKETBASE_COPY_PASTE.md).",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async (id: string) => {
    if (!confirm("Hapus varian biaya ini?")) return;
    await deleteMpFeeTemplateLine(id);
    const fresh = await fetchMpFeeTemplateLines(templateId);
    setLines(fresh);
    setLineCounts((prev) => ({ ...prev, [templateId]: fresh.length }));
    onChanged?.();
  };

  const handleToggleDefault = async (row: MpFeeTemplateLine) => {
    try {
      await updateMpFeeTemplateLine(row.id, { is_default: true });
      for (const s of lines.filter((l) => l.code === row.code && l.id !== row.id && l.is_default)) {
        await updateMpFeeTemplateLine(s.id, { is_default: false });
      }
      setLines(await fetchMpFeeTemplateLines(templateId));
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    }
  };

  const handleDeleteKoleksi = async () => {
    if (!currentKoleksi?.template) return;
    if (!confirm(`Hapus koleksi "${currentKoleksi.label}" dan semua biaya di dalamnya?`)) return;
    try {
      for (const r of lines) await deleteMpFeeTemplateLine(r.id);
      await deleteMpFeeTemplate(currentKoleksi.template.id);
      setLines([]);
      setTemplateId("");
      onChanged?.();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    }
  };

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-amber-700">Buat Platform & Tier dulu (tab ①②), lalu atur biaya di sini.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Koleksi tersimpan */}
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Koleksi paket biaya tersimpan</p>
        <p className="mb-3 text-xs text-slate-500">
          Setiap Platform + Tier = satu koleksi. Setelah klik <strong>Simpan</strong> di varian biaya, otomatis masuk koleksi di bawah dan bisa dipilih di tab ④ Mapping Toko.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {koleksiList.map((k) => {
            const active = selectedTierId === k.tierId;
            const saved = k.template && k.lineCount > 0;
            return (
              <button
                key={k.tierId}
                type="button"
                onClick={() => setSelectedTierId(k.tierId)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white hover:border-indigo-200"
                }`}
              >
                <div className={`rounded-lg p-2 ${saved ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                  <Package className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{k.label}</p>
                  <p className="text-xs text-slate-500">
                    {saved
                      ? `${k.lineCount} varian · tersimpan`
                      : k.template
                        ? "Koleksi kosong — tambah biaya"
                        : "Belum dibuat — pilih & tambah biaya"}
                  </p>
                </div>
                {saved && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-slate-700">Platform + Tier</span>
          <select
            value={selectedTierId}
            onChange={(e) => setSelectedTierId(e.target.value)}
            className={INPUT_CLS}
          >
            {tiers.map((t) => {
              const ch = channels.find((c) => c.id === t.channel);
              return (
                <option key={t.id} value={t.id}>
                  {tierBundleLabel(ch?.name ?? "?", t.label)}
                </option>
              );
            })}
          </select>
        </label>
        {lines.length === 0 && templateId && (
          <button
            type="button"
            disabled={seeding}
            onClick={handleSeedDefaults}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
          >
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Isi biaya standar
          </button>
        )}
      </div>

      {selectedTier && platform && (
        <div className="flex flex-wrap items-center gap-2">
          {savedFlash && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Koleksi tersimpan
            </span>
          )}
          {currentKoleksi?.template && lines.length > 0 && !savedFlash && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              {lines.length} varian tersimpan di koleksi
            </span>
          )}
          {currentKoleksi?.template && lines.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteKoleksi}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Hapus koleksi
            </button>
          )}
        </div>
      )}

      {selectedTier && platform && (
        <p className="text-xs text-slate-500">
          Mengedit koleksi <strong>{tierBundleLabel(platform.name, selectedTier.label)}</strong> — dipilih saat mapping toko (tab ④).
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openAddFee({ label: "Gratis Ongkir", code: "free_shipping", line_group: "mp_fee", calc_type: "percent_cap", rate: 4, max_amount: 40000 })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50">+ Gratis ongkir</button>
            <button type="button" onClick={() => openAddFee({ label: "Cashback", code: "cashback", line_group: "mp_fee", calc_type: "percent_cap", rate: 4.5, max_amount: 60000 })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50">+ Cashback</button>
            <button type="button" onClick={() => openAddFee({ label: "Biaya Pemrosesan", code: "processing", line_group: "operational", calc_type: "fixed", fixed_amount: 1250 })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50">+ Pemrosesan</button>
            <button type="button" onClick={() => openAddFee()} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700">+ Biaya baru</button>
          </div>

          <FeeTable title="Biaya Marketplace & Operasional" rows={[...mpFeeRows, ...opRows]} fmt={fmt} onAdd={() => openAddFee()} onEdit={openEditLine} onDelete={handleDeleteLine} onDefault={handleToggleDefault} />

          {templateId && selectedTier && platform && (
            <ProductSkuFeeTable
              templateId={templateId}
              koleksiLabel={tierBundleLabel(platform.name, selectedTier.label)}
              products={products}
              lines={lines}
              categories={categories}
              onUpdated={(fresh) => {
                setLines(fresh);
                setLineCounts((prev) => ({ ...prev, [templateId]: fresh.length }));
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 3000);
                onChanged?.();
              }}
            />
          )}
        </>
      )}

      {lineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">{lineModal === "add" ? "Tambah biaya" : "Edit biaya"}</h3>
              <button type="button" onClick={() => setLineModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveLine} className="space-y-3">
              <label className="block text-xs font-medium">Nama biaya<input required value={lineForm.label} onChange={(e) => setLineForm({ ...lineForm, label: e.target.value })} className={`mt-1 ${INPUT_CLS}`} placeholder="Promo Extra" /></label>
              {lineForm.line_group === "category" ? (
                <label className="block text-xs font-medium">Kategori produk SERBA *<select required value={lineForm.internal_category} onChange={(e) => setLineForm({ ...lineForm, internal_category: e.target.value })} className={`mt-1 ${INPUT_CLS}`}><option value="">— Pilih —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              ) : (
                <label className="block text-xs font-medium">Grup<select value={lineForm.line_group} onChange={(e) => setLineForm({ ...lineForm, line_group: e.target.value as MpTemplateLineGroup, internal_category: "" })} className={`mt-1 ${INPUT_CLS}`}><option value="mp_fee">Biaya MP</option><option value="operational">Operasional</option></select></label>
              )}
              <label className="block text-xs font-medium">Cara hitung<select value={lineForm.calc_type} onChange={(e) => setLineForm({ ...lineForm, calc_type: e.target.value as MpFeeTemplateLine["calc_type"] })} className={`mt-1 ${INPUT_CLS}`}><option value="percent">Persen</option><option value="percent_cap">Persen + plafon</option><option value="fixed">Fix per order</option><option value="fixed_per_qty">Fix per qty</option></select></label>
              {lineForm.calc_type.startsWith("percent") && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium">
                    Rate (%)
                    <input
                      value={lineForm.rateText}
                      onChange={(e) => setLineForm({ ...lineForm, rateText: e.target.value })}
                      onBlur={() =>
                        setLineForm((f) => ({ ...f, rateText: formatBlurText("decimal", f.rateText) }))
                      }
                      placeholder="4,5"
                      inputMode="decimal"
                      className={`mt-1 ${INPUT_CLS}`}
                    />
                  </label>
                  {lineForm.calc_type === "percent_cap" && (
                    <label className="block text-xs font-medium">
                      Max (Rp)
                      <input
                        value={lineForm.maxAmountText}
                        onChange={(e) => setLineForm({ ...lineForm, maxAmountText: e.target.value })}
                        onBlur={() =>
                          setLineForm((f) => ({
                            ...f,
                            maxAmountText: formatBlurText("integer", f.maxAmountText),
                          }))
                        }
                        placeholder="40.000"
                        inputMode="numeric"
                        className={`mt-1 ${INPUT_CLS}`}
                      />
                    </label>
                  )}
                </div>
              )}
              {(lineForm.calc_type === "fixed" || lineForm.calc_type === "fixed_per_qty") && (
                <label className="block text-xs font-medium">
                  Nominal (Rp)
                  <input
                    value={lineForm.fixedAmountText}
                    onChange={(e) => setLineForm({ ...lineForm, fixedAmountText: e.target.value })}
                    onBlur={() =>
                      setLineForm((f) => ({
                        ...f,
                        fixedAmountText: formatBlurText("integer", f.fixedAmountText),
                      }))
                    }
                    placeholder="1.250"
                    inputMode="numeric"
                    className={`mt-1 ${INPUT_CLS}`}
                  />
                </label>
              )}
              <p className="text-[11px] text-slate-400">
                Tip: rate pakai koma (4,5). Nominal pakai titik ribuan (40.000 = Rp 40 ribu).
              </p>
              <button type="submit" disabled={saving} className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FeeTable({
  title, rows, fmt, onAdd, onEdit, onDelete, onDefault, showCategory,
}: {
  title: string;
  rows: MpFeeTemplateLine[];
  fmt: (n: number) => string;
  onAdd: () => void;
  onEdit: (r: MpFeeTemplateLine) => void;
  onDelete: (id: string) => void;
  onDefault: (r: MpFeeTemplateLine) => void;
  showCategory?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Tambah varian</button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs text-slate-500"><th className="px-4 py-2">Biaya</th>{showCategory && <th>Kategori</th>}<th className="text-right">Rate / Nominal</th><th className="text-right">Max</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={showCategory ? 5 : 4} className="px-4 py-6 text-center text-xs text-slate-400">Belum ada varian — klik Tambah varian</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-50">
              <td className="px-4 py-2">
                <span className="font-medium">{r.label}</span>
                {r.is_default && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Default</span>
                )}
              </td>
              {showCategory && <td className="text-indigo-700">{r.expand?.internal_category?.name ?? "—"}</td>}
              <td className="text-right tabular-nums">
                {r.calc_type.startsWith("percent")
                  ? `${formatIdDecimal(r.rate ?? 0)}%`
                  : fmt(r.fixed_amount ?? 0)}
              </td>
              <td className="text-right tabular-nums">{r.max_amount ? fmt(r.max_amount) : "—"}</td>
              <td className="px-2 text-right whitespace-nowrap">
                <button type="button" title="Jadikan default" onClick={() => onDefault(r)} className={`p-1 ${r.is_default ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}>
                  <Star className={`h-4 w-4 ${r.is_default ? "fill-current" : ""}`} />
                </button>
                <button type="button" onClick={() => onEdit(r)} className="p-1 text-slate-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => onDelete(r.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
