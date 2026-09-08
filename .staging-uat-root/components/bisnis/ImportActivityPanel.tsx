"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronRight, Trash2, RefreshCw } from "lucide-react";
import {
  fetchImportActivityRows,
  cancelSalesImportBatch,
  cancelPaymentImportBatch,
  IMPORT_DISPLAY_STATUS_UI,
  type ImportActivityRow,
  type ImportActivityKind,
} from "@/lib/bisnis/client";
import { getErrorMessage } from "@/lib/errors";

const fmtDateTime = (d?: string) =>
  d
    ? new Date(d).toLocaleString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const KIND_LABEL: Record<ImportActivityKind, string> = {
  penjualan: "Penjualan MP",
  pelunasan: "Pelunasan",
};

type Props = {
  defaultKindFilter?: "all" | ImportActivityKind;
  showKindFilter?: boolean;
};

export function ImportActivityPanel({ defaultKindFilter = "all", showKindFilter = true }: Props) {
  const [activity, setActivity] = useState<ImportActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterFitur, setFilterFitur] = useState<"all" | ImportActivityKind>(defaultKindFilter);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setActivity(await fetchImportActivityRows({ perPage: 100 }));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal memuat riwayat import"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = async (row: ImportActivityRow) => {
    if (!row.canCancel) return;
    if (!confirm(`Batalkan batch ${row.batch_no}? Data staging tidak akan diposting.`)) return;
    try {
      if (row.kind === "penjualan") await cancelSalesImportBatch(row.id);
      else await cancelPaymentImportBatch(row.id);
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal membatalkan"));
    }
  };

  const filtered = activity.filter((r) => {
    if (filterFitur !== "all" && r.kind !== filterFitur) return false;
    if (filterStatus !== "all" && r.displayStatus !== filterStatus) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Riwayat pemrosesan</h2>
          <p className="text-xs text-slate-500">Upload Excel massal — lacak status, buka detail, batalkan batch draft</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showKindFilter && (
            <select
              value={filterFitur}
              onChange={(e) => setFilterFitur(e.target.value as "all" | ImportActivityKind)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">Semua jenis</option>
              <option value="penjualan">Penjualan MP</option>
              <option value="pelunasan">Pelunasan</option>
            </select>
          )}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="all">Semua status</option>
            <option value="success">Selesai</option>
            <option value="partial">Sebagian</option>
            <option value="failed">Gagal</option>
            <option value="ready">Siap posting</option>
            <option value="draft">Draft</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Belum ada riwayat import massal.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <th className="px-4 py-3">Tanggal & waktu</th>
                <th className="px-4 py-3">No. batch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Nama file</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => {
                const ui = IMPORT_DISPLAY_STATUS_UI[row.displayStatus];
                return (
                  <tr key={`${row.kind}-${row.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{fmtDateTime(row.created)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.batch_no}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ui.className}`}>
                        {ui.label}
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 font-medium text-slate-900">
                      {row.source_filename ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{KIND_LABEL[row.kind]}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.progressLabel}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={row.href}
                          className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline"
                        >
                          Detail <ChevronRight className="h-4 w-4" />
                        </Link>
                        {row.canCancel && (
                          <button
                            type="button"
                            title="Batalkan batch"
                            onClick={() => void handleCancel(row)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
