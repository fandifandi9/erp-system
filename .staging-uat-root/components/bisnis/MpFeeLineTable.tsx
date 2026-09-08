"use client";

import { Plus, Pencil, Trash2, Star } from "lucide-react";
import type { MpFeeTemplateLine } from "@/lib/bisnis/types";
import { mpFeeLineSummary } from "@/lib/bisnis/mp-fee-line-ux";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

type Props = {
  title: string;
  subtitle?: string;
  rows: MpFeeTemplateLine[];
  onAdd: () => void;
  onEdit: (r: MpFeeTemplateLine) => void;
  onDelete: (id: string) => void;
  onDefault: (r: MpFeeTemplateLine) => void;
  showCategory?: boolean;
};

export function MpFeeLineTable({
  title,
  subtitle,
  rows,
  onAdd,
  onEdit,
  onDelete,
  onDefault,
  showCategory,
}: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Tambah biaya
          </button>
        </div>
        {subtitle && <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-slate-500">
            <th className="px-4 py-2">Nama biaya</th>
            {showCategory && <th>Kategori</th>}
            <th className="px-2 py-2">Dasar</th>
            <th className="px-2 py-2">Nilai</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={showCategory ? 5 : 4} className="px-4 py-6 text-center text-xs text-slate-400">
                Belum ada biaya — tambah manual atau klik Isi biaya standar
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const summary = mpFeeLineSummary(r, fmt);
              return (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2">
                    <span className="font-medium">{r.label}</span>
                    {r.is_default && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Default
                      </span>
                    )}
                  </td>
                  {showCategory && (
                    <td className="text-indigo-700">{r.expand?.internal_category?.name ?? "—"}</td>
                  )}
                  <td className="px-2 py-2 text-xs text-slate-600">{summary.basis}</td>
                  <td className="px-2 py-2 text-xs font-medium tabular-nums text-slate-800">{summary.nilai}</td>
                  <td className="whitespace-nowrap px-2 text-right">
                    <button
                      type="button"
                      title="Jadikan default"
                      onClick={() => onDefault(r)}
                      className={`p-1 ${r.is_default ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}
                    >
                      <Star className={`h-4 w-4 ${r.is_default ? "fill-current" : ""}`} />
                    </button>
                    <button type="button" onClick={() => onEdit(r)} className="p-1 text-slate-400 hover:text-indigo-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onDelete(r.id)} className="p-1 text-slate-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
