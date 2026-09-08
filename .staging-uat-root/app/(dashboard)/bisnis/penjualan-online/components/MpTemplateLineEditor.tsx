"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Sparkles, CheckCircle2, Star } from "lucide-react";
import {
  fetchMpFeeTemplateLines,
  createMpFeeTemplateLine,
  updateMpFeeTemplateLine,
  deleteMpFeeTemplateLine,
  ensureDefaultFeeLines,
  buildMpFeeLinePayload,
  mpFeeLineFormDefaults,
  mpFeeLineFormFromRecord,
  parseMpFeeLineForm,
  type MpFeeLineFormState,
} from "@/lib/bisnis/mp-template-client";
import type { MpFeeTemplateLine } from "@/lib/bisnis/types";
import ProductSkuFeeTable, { type ProductRow } from "./ProductSkuFeeTable";
import SkuEngineFeeTable from "./SkuEngineFeeTable";
import { getErrorMessage } from "@/lib/errors";
import { MpFeeLineFormFields } from "@/components/bisnis/MpFeeLineFormFields";
import { MpFeeLineTable } from "@/components/bisnis/MpFeeLineTable";

type Category = { id: string; name: string };

type Props = {
  templateId: string;
  label: string;
  categories: Category[];
  products: ProductRow[];
  /** Tier seller rumus ini — jika ada, fee per SKU memakai Fee Engine baru. */
  sellerTierId?: string;
  onChanged?: () => void;
};

const EMPTY_LINE = mpFeeLineFormDefaults();

export default function MpTemplateLineEditor({
  templateId,
  label,
  categories,
  products,
  sellerTierId,
  onChanged,
}: Props) {
  const [lines, setLines] = useState<MpFeeTemplateLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [lineModal, setLineModal] = useState<"add" | "edit" | null>(null);
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState<MpFeeLineFormState>(EMPTY_LINE);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const loadLines = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      setLines(await fetchMpFeeTemplateLines(templateId));
    } catch (e: unknown) {
      alert(getErrorMessage(e));
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  const mpFeeRows = lines.filter((l) => l.line_group === "mp_fee");
  const opRows = lines.filter((l) => l.line_group === "operational");

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      await ensureDefaultFeeLines(templateId);
      await loadLines();
      onChanged?.();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setSeeding(false);
    }
  };

  const openAddFee = (
    preset?: Partial<MpFeeLineFormState & { rate?: number; max_amount?: number; fixed_amount?: number }>,
  ) => {
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
      await loadLines();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
      onChanged?.();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Gagal menyimpan biaya"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async (id: string) => {
    if (!confirm("Hapus varian biaya ini?")) return;
    await deleteMpFeeTemplateLine(id);
    await loadLines();
    onChanged?.();
  };

  const handleToggleDefault = async (row: MpFeeTemplateLine) => {
    try {
      await updateMpFeeTemplateLine(row.id, { is_default: true });
      for (const s of lines.filter((l) => l.code === row.code && l.id !== row.id && l.is_default)) {
        await updateMpFeeTemplateLine(s.id, { is_default: false });
      }
      await loadLines();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-600">
          Mengatur rumus <strong>{label}</strong>
        </p>
        {savedFlash && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Tersimpan
          </span>
        )}
        {lines.length === 0 && (
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedDefaults()}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Isi biaya standar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            openAddFee({
              label: "Gratis Ongkir",
              code: "free_shipping",
              line_group: "mp_fee",
              calc_type: "percent_cap",
              applies_to: "order",
              rate: 4,
              max_amount: 40000,
            })
          }
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
        >
          + Gratis ongkir
        </button>
        <button
          type="button"
          onClick={() =>
            openAddFee({
              label: "Cashback",
              code: "cashback",
              line_group: "mp_fee",
              calc_type: "percent_cap",
              applies_to: "order",
              rate: 4.5,
              max_amount: 60000,
            })
          }
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
        >
          + Cashback
        </button>
        <button
          type="button"
          onClick={() =>
            openAddFee({
              label: "Biaya Pemrosesan",
              code: "processing",
              line_group: "operational",
              calc_type: "fixed",
              applies_to: "order",
              fixed_amount: 1250,
            })
          }
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
        >
          + Pemrosesan
        </button>
        <button
          type="button"
          onClick={() => openAddFee()}
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          + Biaya baru
        </button>
      </div>

      <MpFeeLineTable
        title="Biaya marketplace & operasional"
        subtitle="Per pesanan = sekali per no. order · Per produk = ikut qty/nilai baris item"
        rows={[...mpFeeRows, ...opRows]}
        onAdd={() => openAddFee()}
        onEdit={openEditLine}
        onDelete={handleDeleteLine}
        onDefault={handleToggleDefault}
      />

      {sellerTierId ? (
        <SkuEngineFeeTable tierId={sellerTierId} koleksiLabel={label} products={products} />
      ) : (
        <ProductSkuFeeTable
          templateId={templateId}
          koleksiLabel={label}
          products={products}
          lines={lines}
          categories={categories}
          onUpdated={(fresh) => {
            setLines(fresh);
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 3000);
            onChanged?.();
          }}
        />
      )}

      {lineModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">{lineModal === "add" ? "Tambah biaya" : "Edit biaya"}</h3>
              <button type="button" onClick={() => setLineModal(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveLine(e)} className="space-y-3">
              <MpFeeLineFormFields form={lineForm} onChange={setLineForm} categories={categories} />
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
