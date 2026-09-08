"use client";

import { useCallback, useEffect, useState } from "react";
import {
  downloadPayslipHtml,
  fetchPayslipPreviewHtml,
  fetchSelfPayslipsApi,
  type StaffPayslipClient,
} from "@/lib/payroll-client";
import { canAccess } from "@/lib/rbac";
import { pb } from "@/lib/pocketbase";
import { Banknote, Download, Eye, Loader2, X } from "lucide-react";
import { StaffBenefitCard } from "@/components/StaffBenefitCard";
import { AccountVerificationModal } from "@/components/account/AccountVerificationModal";
import { formatPeriodMonthYear } from "@/lib/hr/payroll-slip-pdf";
import { useSensitiveVerificationSession } from "@/lib/hooks/useSensitiveVerificationSession";

function money(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

const PERIOD_STATUS_LABEL: Record<string, string> = {
  approved: "Disetujui",
  paid: "Dibayar",
  closed: "Periode ditutup",
};

export default function StaffPayrollPage() {
  const [slips, setSlips] = useState<StaffPayslipClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: "preview" | "download"; id: string } | null>(
    null,
  );

  const current = pb.authStore.model;
  const uid = current?.id ?? "";
  const hasAccess = !!current && canAccess(current, "/dashboard-staff");

  const closePreview = useCallback(() => {
    setPreviewId(null);
    setPreviewHtml(null);
    setPreviewError("");
  }, []);

  useSensitiveVerificationSession("payslip", {
    onRevoked: () => {
      closePreview();
      setVerifyOpen(false);
      setPendingAction(null);
    },
  });

  const load = useCallback(async () => {
    if (!uid) {
      setSlips([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSlips(await fetchSelfPayslipsApi());
    } catch (e) {
      console.error(e);
      setSlips([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const runPreview = async (id: string) => {
    setPreviewId(id);
    setPreviewHtml(null);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      setPreviewHtml(await fetchPayslipPreviewHtml(id));
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "ACCOUNT_VERIFICATION_REQUIRED") {
        setPreviewId(null);
        setPendingAction({ type: "preview", id });
        setVerifyOpen(true);
        return;
      }
      setPreviewError(err.message || "Gagal memuat preview slip gaji.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const runDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadPayslipHtml(id);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "ACCOUNT_VERIFICATION_REQUIRED") {
        setPendingAction({ type: "download", id });
        setVerifyOpen(true);
        return;
      }
      alert(err.message || "Gagal mengunduh slip gaji.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleVerified = () => {
    setVerifyOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.type === "preview") void runPreview(action.id);
    else void runDownload(action.id);
  };

  const openPreview = (id: string) => void runPreview(id);
  const handleDownload = (id: string) => void runDownload(id);

  if (!hasAccess) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-slate-600">Anda tidak memiliki akses ke halaman ini.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Banknote className="h-7 w-7 text-emerald-600" />
          Slip Gaji
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Hanya periode yang sudah disetujui atau dibayar yang ditampilkan. Dokumen rahasia — hanya untuk Anda.
        </p>
      </div>

      {uid ? <StaffBenefitCard userId={uid} /> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat…
        </div>
      ) : slips.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          Belum ada slip gaji yang dapat ditampilkan.
        </div>
      ) : (
        <ul className="space-y-4">
          {slips.map((s) => (
            <li
              key={s.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Slip Gaji</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatPeriodMonthYear(s.period_key)}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-700">{s.company_name}</p>
              </div>
              <div className="space-y-3 px-4 py-4 text-sm">
                <MetaRow label="Nama" value={s.employee_name} />
                {s.position ? <MetaRow label="Jabatan" value={s.position} /> : null}
                {s.department ? <MetaRow label="Departemen" value={s.department} /> : null}
                <MetaRow label="Gaji bersih" value={`Rp ${money(s.net_amount)}`} strong />
                <MetaRow
                  label="Status"
                  value={PERIOD_STATUS_LABEL[s.period_status] ?? s.period_status}
                />
                {s.is_demo ? (
                  <p className="text-xs text-amber-700">Data demo UAT lokal — bukan payroll produksi.</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void openPreview(s.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4" />
                    Lihat Slip
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownload(s.id)}
                    disabled={downloadingId === s.id}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {downloadingId === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Unduh PDF
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {previewId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="font-semibold text-slate-800">Preview Slip Gaji</p>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {previewLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin" />
                Memuat slip…
              </div>
            ) : previewError ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{previewError}</p>
              </div>
            ) : previewHtml ? (
              <iframe
                title="Preview slip gaji"
                srcDoc={previewHtml}
                className="min-h-0 flex-1 w-full border-0 bg-slate-50"
                sandbox="allow-same-origin"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <AccountVerificationModal
        open={verifyOpen}
        context="payslip"
        onClose={() => {
          setVerifyOpen(false);
          setPendingAction(null);
        }}
        onVerified={handleVerified}
      />
    </div>
  );
}

function MetaRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-base font-bold text-slate-900" : "text-slate-700"}`}>
      <span className="text-slate-500">{label}</span>
      <span className="shrink-0 text-right">{value}</span>
    </div>
  );
}
