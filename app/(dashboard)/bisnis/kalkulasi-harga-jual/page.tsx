"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Loader2, Calculator, Sparkles,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import {
  fetchMpFeeTemplates,
  createMpFeeTemplate,
  fetchMpFeeTemplateLines,
  createMpFeeTemplateLine,
  updateMpFeeTemplateLine,
  deleteMpFeeTemplateLine,
  seedShopeeMallTemplate,
  buildMpFeeLinePayload,
  mpFeeLineFormDefaults,
  mpFeeLineFormFromRecord,
  parseMpFeeLineForm,
  type MpFeeLineFormState,
} from "@/lib/bisnis/mp-template-client";
import { formatIdDecimal, formatIdInteger, parseIdDecimal, parseIdInteger } from "@/lib/format-id-number";
import { recommendSellingPrice } from "@/lib/bisnis/mp-template-engine";
import type { MpFeeTemplate, MpFeeTemplateLine, MpTemplateLineGroup } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

const INPUT_CLS =
  "w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

type Category = { id: string; name: string };
type Product = { id: string; sku: string; name: string; category?: string; unit_cost?: number };

const EMPTY_LINE = mpFeeLineFormDefaults();

type ProfitMode = "percent" | "nominal";
type InputMode = "master" | "manual";

function formatBlurText(mode: "integer" | "decimal", raw: string): string {
  if (!raw.trim()) return "";
  const n = mode === "integer" ? parseIdInteger(raw) : parseIdDecimal(raw);
  if (!Number.isFinite(n)) return raw;
  return mode === "integer" ? formatIdInteger(Math.round(n)) : formatIdDecimal(n);
}

export default function KalkulasiHargaJualPage() {
  const [templates, setTemplates] = useState<MpFeeTemplate[]>([]);
  const [lines, setLines] = useState<MpFeeTemplateLine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [linesLoading, setLinesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [simCostText, setSimCostText] = useState("400.000");
  const [simProfitMode, setSimProfitMode] = useState<ProfitMode>("percent");
  const [simProfitText, setSimProfitText] = useState("20");
  const [simProductPick, setSimProductPick] = useState("");
  const [simManualFeeText, setSimManualFeeText] = useState("");

  const [lineModal, setLineModal] = useState<"add" | "edit" | null>(null);
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState<MpFeeLineFormState>(EMPTY_LINE);
  const [tplModal, setTplModal] = useState(false);
  const [tplForm, setTplForm] = useState({ code: "", name: "", notes: "" });

  const selected = templates.find((t) => t.id === selectedId);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tpl, cat, pr] = await Promise.all([
        fetchMpFeeTemplates({ filter: "is_active = true" }),
        pb.collection(INV_COLLECTIONS.categories).getFullList<Category>({ sort: "name", requestKey: null }),
        pb.collection(INV_COLLECTIONS.products).getFullList<Product>({
          filter: "is_active = true",
          sort: "name",
          fields: "id,sku,name,category,unit_cost",
          requestKey: null,
        }),
      ]);
      setTemplates(tpl);
      setCategories(cat);
      setProducts(pr);
      if (!selectedId && tpl[0]) setSelectedId(tpl[0].id);
    } catch (e: unknown) {
      setError(
        getErrorMessage(e) +
          "\n\nBuat collection biz_mp_fee_templates & biz_mp_fee_template_lines di PocketBase (lihat POCKETBASE_MP_SALES_SETUP.md).",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLines = useCallback(async (templateId: string) => {
    if (!templateId) {
      setLines([]);
      return;
    }
    setLinesLoading(true);
    try {
      const rows = await fetchMpFeeTemplateLines(templateId);
      setLines(rows);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLinesLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { if (selectedId) loadLines(selectedId); }, [selectedId, loadLines]);

  const simCost = parseIdInteger(simCostText);
  const simManualFeeRate = parseIdDecimal(simManualFeeText);
  const isMasterMode = inputMode === "master";
  const simProductRow = isMasterMode && simProductPick
    ? products.find((p) => p.id === simProductPick)
    : undefined;
  const simProductId = simProductRow?.id;
  const masterCost = simProductRow?.unit_cost != null && simProductRow.unit_cost > 0
    ? Math.round(simProductRow.unit_cost)
    : null;

  const profitTarget = useMemo(() => {
    if (simProfitMode === "percent") {
      const pct = parseIdDecimal(simProfitText);
      if (!Number.isFinite(pct) || pct < 0) return null;
      return { mode: "percent" as const, profitPctOnCost: pct };
    }
    const amt = parseIdInteger(simProfitText);
    if (!Number.isFinite(amt) || amt < 0) return null;
    return { mode: "nominal" as const, profitAmount: amt };
  }, [simProfitMode, simProfitText]);

  const effectiveCost = isMasterMode ? masterCost : simCost;

  const recommendation = useMemo(() => {
    if (lines.length === 0 || effectiveCost == null || effectiveCost <= 0 || !profitTarget) return null;
    if (isMasterMode) {
      if (!simProductId) return null;
      return recommendSellingPrice(
        lines,
        effectiveCost,
        profitTarget,
        simProductId,
        simProductRow?.category,
      );
    }
    if (!Number.isFinite(simManualFeeRate) || simManualFeeRate < 0) return null;
    return recommendSellingPrice(
      lines,
      effectiveCost,
      profitTarget,
      undefined,
      undefined,
      simManualFeeRate,
    );
  }, [
    lines,
    effectiveCost,
    profitTarget,
    isMasterMode,
    simProductId,
    simProductRow?.category,
    simManualFeeRate,
  ]);

  const previewAmount = (row: MpFeeTemplateLine) => {
    if (!recommendation) return 0;
    const item = recommendation.simulation.items.find((i) => i.code === row.code && i.label === row.label);
    return item?.amount ?? 0;
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const tpl = await seedShopeeMallTemplate();
      await loadTemplates();
      setSelectedId(tpl.id);
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setSeeding(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMpFeeTemplate({ ...tplForm, is_active: true, sort_order: templates.length + 1 });
      setTplModal(false);
      setTplForm({ code: "", name: "", notes: "" });
      await loadTemplates();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  const handleSaveLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const parsed = parseMpFeeLineForm(lineForm);
    if (!parsed.ok) {
      alert(parsed.message);
      return;
    }
    try {
      const existingCodes = lines.filter((l) => l.id !== editLineId).map((l) => l.code);
      const payload = buildMpFeeLinePayload(selectedId, parsed.data, {
        existingCodes: editLineId ? undefined : existingCodes,
      });
      if (editLineId) await updateMpFeeTemplateLine(editLineId, payload);
      else await createMpFeeTemplateLine(payload);
      setLineModal(null);
      await loadLines(selectedId);
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Gagal menyimpan biaya"));
    }
  };

  const openEditLine = (row: MpFeeTemplateLine) => {
    setEditLineId(row.id);
    setLineForm(mpFeeLineFormFromRecord(row));
    setLineModal("edit");
  };

  /** Tabel biaya: hanya biaya umum MP + kategori legacy. Fee per SKU di atas, tidak dilist per produk. */
  const mpFeeRows = lines.filter((l) => {
    if (l.line_group === "product") return false;
    if (l.line_group === "category" && simProductId) return false;
    return l.line_group === "mp_fee" || l.line_group === "category";
  });
  const opRows = lines.filter((l) => l.line_group === "operational");

  const selectedSkuFeeLine = isMasterMode && simProductId
    ? lines.find((l) => l.line_group === "product" && l.scope_product === simProductId)
    : undefined;
  const manualSkuFeeAmount =
    !isMasterMode && recommendation
      ? (recommendation.simulation.items.find((i) => i.code === "manual_product_fee")?.amount ?? 0)
      : 0;
  const selectedSkuFeeAmount =
    selectedSkuFeeLine && recommendation
      ? (recommendation.simulation.items.find(
          (i) => i.code === selectedSkuFeeLine.code && i.label === selectedSkuFeeLine.label,
        )?.amount ?? 0)
      : manualSkuFeeAmount;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link href="/bisnis" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Manajemen Bisnis
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Kalkulasi Harga Jual</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Rekomendasi harga jual satuan dari modal + target untung. Pilih tier marketplace di kiri untuk bandingkan biaya.
              Atur fee template di{" "}
              <Link href="/bisnis/penjualan-online/pengaturan" className="font-medium text-indigo-600 underline">
                Penjualan Online → Pengaturan
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Contoh Shopee Mall
            </button>
            <button
              type="button"
              onClick={() => setTplModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> Template baru
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Template</p>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              </div>
            ) : templates.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">Belum ada template. Klik &quot;Contoh Shopee Mall&quot;.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        selectedId === t.id
                          ? "bg-indigo-600 font-semibold text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {t.name}
                      <span className={`mt-0.5 block font-mono text-xs ${selectedId === t.id ? "text-indigo-200" : "text-slate-400"}`}>
                        {t.code}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main className="min-w-0 space-y-4">
            {!selected ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center text-sm text-slate-400">
                Pilih atau buat template
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                    <span className="font-mono text-xs text-slate-400">{selected.code}</span>
                  </div>

                  <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                    <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <Calculator className="h-4 w-4" /> Rekomendasi harga jual satuan
                    </div>
                    <p className="mb-3 text-[11px] text-slate-500">
                      Pilih template di sidebar kiri untuk bandingkan platform + tier.
                    </p>
                    <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setInputMode("master");
                          setSimCostText("");
                          setSimManualFeeText("");
                          setSimProductPick(products[0]?.id ?? "");
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          isMasterMode
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Produk dari master SERBA
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setInputMode("manual");
                          setSimProductPick("");
                          setSimCostText("400.000");
                          setSimManualFeeText("");
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          !isMasterMode
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Input manual
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {isMasterMode ? (
                        <>
                          <label className="text-xs">
                            <span className="mb-1 block text-slate-600">Produk / SKU</span>
                            <select
                              required
                              value={simProductPick}
                              onChange={(e) => setSimProductPick(e.target.value)}
                              className={INPUT_CLS}
                            >
                              <option value="">— Pilih produk —</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs">
                            <span className="mb-1 block text-slate-600">Modal produk (Rp)</span>
                            <input
                              type="text"
                              readOnly
                              value={
                                masterCost != null
                                  ? formatIdInteger(masterCost)
                                  : simProductRow
                                    ? "— belum ada unit cost —"
                                    : ""
                              }
                              className={`${INPUT_CLS} cursor-not-allowed bg-slate-100 text-slate-600`}
                            />
                            <span className="mt-1 block text-[10px] text-slate-400">
                              {simProductRow
                                ? `Modal dari master · fee SKU dari template (tab Pengaturan ③)`
                                : "Pilih produk — modal tidak bisa diketik manual"}
                            </span>
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="text-xs">
                            <span className="mb-1 block text-slate-600">Modal produk (Rp)</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={simCostText}
                              onChange={(e) => setSimCostText(e.target.value)}
                              onBlur={() => {
                                const n = parseIdInteger(simCostText);
                                if (Number.isFinite(n)) setSimCostText(formatIdInteger(n));
                              }}
                              placeholder="400.000"
                              className={INPUT_CLS}
                            />
                            <span className="mt-1 block text-[10px] text-slate-400">
                              Produk belum ada di master — ketik modal manual
                            </span>
                          </label>
                          <label className="text-xs">
                            <span className="mb-1 block text-slate-600">Fee produk (%)</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={simManualFeeText}
                              onChange={(e) => setSimManualFeeText(e.target.value)}
                              onBlur={() => {
                                const n = parseIdDecimal(simManualFeeText);
                                if (Number.isFinite(n)) setSimManualFeeText(formatIdDecimal(n));
                              }}
                              placeholder="10,2"
                              className={INPUT_CLS}
                            />
                            <span className="mt-1 block text-[10px] text-slate-400">
                              Estimasi komisi/fee produk — isi manual (contoh: 5 atau 10,2)
                            </span>
                          </label>
                        </>
                      )}
                      <div className="text-xs sm:col-span-2">
                        <span className="mb-1.5 block text-slate-600">Target keuntungan / margin kotor</span>
                        <div className="mb-2 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSimProfitMode("percent");
                              setSimProfitText("");
                            }}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                              simProfitMode === "percent"
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            Persen (%)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSimProfitMode("nominal");
                              setSimProfitText("");
                            }}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                              simProfitMode === "nominal"
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            Nominal (Rp)
                          </button>
                        </div>
                        <input
                          type="text"
                          inputMode={simProfitMode === "percent" ? "decimal" : "numeric"}
                          value={simProfitText}
                          onChange={(e) => setSimProfitText(e.target.value)}
                          onBlur={() => {
                            if (simProfitMode === "percent") {
                              const n = parseIdDecimal(simProfitText);
                              if (Number.isFinite(n)) setSimProfitText(formatIdDecimal(n));
                            } else {
                              const n = parseIdInteger(simProfitText);
                              if (Number.isFinite(n)) setSimProfitText(formatIdInteger(n));
                            }
                          }}
                          placeholder={simProfitMode === "percent" ? "20" : "80.000"}
                          className={INPUT_CLS}
                        />
                        <span className="mt-1 block text-[10px] text-slate-400">
                          {simProfitMode === "percent"
                            ? "Persen dari modal — contoh: 20 = net modal + 20%"
                            : "Untung bersih (Rp) setelah biaya MP — contoh: 80.000"}
                        </span>
                      </div>
                    </div>
                    {recommendation ? (
                      <div className="mt-4 border-t border-emerald-100 pt-4">
                        <div className="rounded-lg bg-white/80 px-4 py-3 ring-1 ring-indigo-100">
                          <span className="text-xs text-slate-500">Rekomendasi harga jual satuan</span>
                          <p className="text-2xl font-bold text-indigo-700">{fmt(recommendation.recommendedUnitPrice)}</p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div>
                            <span className="text-xs text-slate-500">Total biaya MP + operasional</span>
                            <p className="text-base font-semibold text-amber-700">{fmt(recommendation.totalFees)}</p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500">Net diterima (setelah biaya)</span>
                            <p className="text-base font-semibold text-emerald-700">{fmt(recommendation.expectedNet)}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-amber-700">
                        {isMasterMode
                          ? !simProductPick
                            ? "Pilih produk dari master SERBA."
                            : masterCost == null
                              ? "Produk belum punya unit cost di Inventori — gunakan tab Input manual."
                              : "Isi target untung yang valid. Pastikan template punya baris biaya."
                          : !Number.isFinite(simCost) || simCost <= 0
                            ? "Isi modal produk."
                            : simManualFeeText.trim() === "" || !Number.isFinite(simManualFeeRate)
                              ? "Isi fee produk (%) untuk estimasi komisi."
                              : "Isi target untung yang valid. Pastikan template punya baris biaya."}
                      </p>
                    )}
                  </div>
                </div>

                {linesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                  </div>
                ) : (
                  <>
                    <FeeTable
                      title="Biaya Marketplace"
                      subtitle={
                        isMasterMode && simProductRow && selectedSkuFeeLine
                          ? `Fee SKU ${simProductRow.sku} (${formatIdDecimal(selectedSkuFeeLine.rate ?? 0)}%) dari template — Pengaturan ③.`
                          : isMasterMode && simProductRow
                            ? `Produk ${simProductRow.sku} — belum ada fee SKU di template tier ini.`
                            : !isMasterMode && simManualFeeText.trim()
                              ? `Fee produk manual ${simManualFeeText}% — estimasi komisi untuk produk di luar master.`
                              : undefined
                      }
                      rows={mpFeeRows}
                      fmt={fmt}
                      previewAmount={previewAmount}
                      skuFeeAmount={selectedSkuFeeAmount}
                      onAdd={() => {
                        setEditLineId(null);
                        setLineForm(
                          mpFeeLineFormDefaults({
                            line_group: "mp_fee",
                            sort_order: (lines.length + 1) * 10,
                          }),
                        );
                        setLineModal("add");
                      }}
                      onEdit={openEditLine}
                      onDelete={async (id) => {
                        if (!confirm("Hapus baris?")) return;
                        await deleteMpFeeTemplateLine(id);
                        loadLines(selectedId);
                      }}
                    />
                    <FeeTable
                      title="Biaya Operasional"
                      rows={opRows}
                      fmt={fmt}
                      previewAmount={previewAmount}
                      onAdd={() => {
                        setEditLineId(null);
                        setLineForm(
                          mpFeeLineFormDefaults({
                            line_group: "operational",
                            calc_type: "fixed",
                            fixed_amount: 1250,
                            sort_order: (lines.length + 1) * 10,
                          }),
                        );
                        setLineModal("add");
                      }}
                      onEdit={openEditLine}
                      onDelete={async (id) => {
                        if (!confirm("Hapus baris?")) return;
                        await deleteMpFeeTemplateLine(id);
                        loadLines(selectedId);
                      }}
                    />
                  </>
                )}
              </>
            )}
          </main>
        </div>

        {lineModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{lineModal === "add" ? "Tambah biaya" : "Edit biaya"}</h3>
                <button type="button" onClick={() => setLineModal(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveLine} className="space-y-3">
                <label className="block text-xs font-medium text-slate-700">
                  Nama biaya
                  <input required value={lineForm.label} onChange={(e) => setLineForm({ ...lineForm, label: e.target.value })} className={`mt-1 ${INPUT_CLS}`} placeholder="Gratis Ongkir Extra" />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Kode (slug)
                  <input required value={lineForm.code} onChange={(e) => setLineForm({ ...lineForm, code: e.target.value })} className={`mt-1 ${INPUT_CLS}`} placeholder="free_shipping" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Grup
                    <select value={lineForm.line_group} onChange={(e) => setLineForm({ ...lineForm, line_group: e.target.value as MpTemplateLineGroup })} className={`mt-1 ${INPUT_CLS}`}>
                      <option value="mp_fee">Biaya MP</option>
                      <option value="category">Biaya kategori</option>
                      <option value="operational">Operasional</option>
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    Berlaku
                    <select value={lineForm.applies_to} onChange={(e) => setLineForm({ ...lineForm, applies_to: e.target.value as "line" | "order" })} className={`mt-1 ${INPUT_CLS}`}>
                      <option value="order">Per order</option>
                      <option value="line">Per baris</option>
                    </select>
                  </label>
                </div>
                <label className="block text-xs font-medium text-slate-700">
                  Tipe hitung
                  <select value={lineForm.calc_type} onChange={(e) => setLineForm({ ...lineForm, calc_type: e.target.value as MpFeeTemplateLine["calc_type"] })} className={`mt-1 ${INPUT_CLS}`}>
                    <option value="percent">Persen</option>
                    <option value="percent_cap">Persen + plafon</option>
                    <option value="fixed">Fix per order</option>
                    <option value="fixed_per_qty">Fix per qty</option>
                  </select>
                </label>
                {lineForm.line_group === "category" && (
                  <label className="block text-xs font-medium text-slate-700">
                    Kategori produk SERBA
                    <select value={lineForm.internal_category} onChange={(e) => setLineForm({ ...lineForm, internal_category: e.target.value })} className={`mt-1 ${INPUT_CLS}`}>
                      <option value="">Semua / default</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {lineForm.calc_type.startsWith("percent") && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-medium text-slate-700">
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
                      <label className="block text-xs font-medium text-slate-700">
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
                  <label className="block text-xs font-medium text-slate-700">
                    Nominal fix
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
                <label className="block text-xs font-medium text-slate-700">
                  Urutan
                  <input type="number" value={lineForm.sort_order} onChange={(e) => setLineForm({ ...lineForm, sort_order: Number(e.target.value) })} className={`mt-1 ${INPUT_CLS}`} />
                </label>
                <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                  Simpan
                </button>
              </form>
            </div>
          </div>
        )}

        {tplModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="mb-4 font-semibold">Template baru</h3>
              <form onSubmit={handleSaveTemplate} className="space-y-3">
                <label className="block text-xs font-medium">Kode <input required value={tplForm.code} onChange={(e) => setTplForm({ ...tplForm, code: e.target.value })} className={`mt-1 ${INPUT_CLS}`} placeholder="tokopedia_mall" /></label>
                <label className="block text-xs font-medium">Nama <input required value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} className={`mt-1 ${INPUT_CLS}`} placeholder="Tokopedia Mall" /></label>
                <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white">Buat</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeeTable({
  title,
  subtitle,
  rows,
  fmt,
  previewAmount,
  skuFeeAmount = 0,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  rows: MpFeeTemplateLine[];
  fmt: (n: number) => string;
  previewAmount: (r: MpFeeTemplateLine) => number;
  skuFeeAmount?: number;
  onAdd: () => void;
  onEdit: (r: MpFeeTemplateLine) => void;
  onDelete: (id: string) => void;
}) {
  const subtotal = rows.reduce((s, r) => s + previewAmount(r), 0);
  const subtotalPct =
    rows.filter((r) => r.calc_type.startsWith("percent")).reduce((s, r) => s + (r.rate ?? 0), 0);
  const totalWithSku = subtotal + skuFeeAmount;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onAdd} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
            <Plus className="h-3.5 w-3.5" /> Tambah
          </button>
        </div>
        {subtitle && <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-slate-500">
            <th className="px-4 py-2">Biaya</th>
            <th className="px-2 py-2 text-right">%</th>
            <th className="px-2 py-2 text-right">Rp @ rekomendasi</th>
            <th className="px-2 py-2 text-right">Maximal</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-400">
                Belum ada baris — klik Tambah
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-2">
                  <span className="font-medium text-slate-800">{r.label}</span>
                  {r.expand?.internal_category?.name && (
                    <span className="ml-1 text-xs text-indigo-600">({r.expand.internal_category.name})</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                  {r.calc_type.startsWith("percent") ? `${r.rate ?? 0}%` : "—"}
                </td>
                <td className="px-2 py-2 text-right font-medium tabular-nums text-amber-800">{fmt(previewAmount(r))}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                  {r.max_amount ? fmt(r.max_amount) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => onEdit(r)} className="p-1 text-slate-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => onDelete(r.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            {skuFeeAmount > 0 && (
              <tr className="border-t bg-violet-50/50 text-xs">
                <td className="px-4 py-2 text-violet-800">+ Fee produk</td>
                <td className="px-2 py-2 text-right text-violet-700">—</td>
                <td className="px-2 py-2 text-right font-medium tabular-nums text-violet-800">{fmt(skuFeeAmount)}</td>
                <td colSpan={2} />
              </tr>
            )}
            <tr className="border-t bg-slate-50 font-semibold">
              <td className="px-4 py-2 text-slate-700">Subtotal biaya MP</td>
              <td className="px-2 py-2 text-right text-slate-600">{subtotalPct > 0 ? `${subtotalPct.toFixed(1)}%*` : "—"}</td>
              <td className="px-2 py-2 text-right text-amber-900">{fmt(totalWithSku)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
