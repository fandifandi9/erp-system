"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, X, Check } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import type { HrPayrollBankRequestView } from "@/lib/hr/payroll-bank-account-types";

function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

function formatDt(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PayrollBankApprovalPanel() {
  const [items, setItems] = useState<HrPayrollBankRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [review, setReview] = useState<HrPayrollBankRequestView | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hr/payroll-bank-requests", { credentials: "include", headers: authHeaders(false) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: HrPayrollBankRequestView[]; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat pengajuan.");
      setItems(json.items ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal memuat.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/hr/payroll-bank-requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ effective_from: effectiveFrom }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Aksi gagal.");
      setMsg("Perubahan rekening disetujui.");
      setReview(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Aksi gagal.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) {
      setMsg("Alasan penolakan wajib diisi.");
      return;
    }
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/hr/payroll-bank-requests/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Aksi gagal.");
      setMsg("Perubahan rekening ditolak.");
      setReview(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Aksi gagal.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-600">Tidak ada pengajuan menunggu.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Bank</th>
                <th className="px-3 py-2">No. Rekening</th>
                <th className="px-3 py-2">Pemilik</th>
                <th className="px-3 py-2">Diajukan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{item.employee_name}</td>
                  <td className="px-3 py-2">{item.proposed.bank_name}</td>
                  <td className="px-3 py-2 font-mono">{item.proposed.account_number_masked}</td>
                  <td className="px-3 py-2">{item.proposed.account_holder_name}</td>
                  <td className="px-3 py-2">{formatDt(item.created)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Menunggu</span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReview(item);
                        setEffectiveFrom(new Date().toISOString().slice(0, 10));
                        setRejectReason("");
                      }}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {review ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold">Review Pengajuan Rekening</h3>
              <button type="button" onClick={() => setReview(null)} className="rounded-lg p-1 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">{review.employee_name}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Rekening saat ini</p>
                {review.current ? (
                  <p className="mt-1">
                    {review.current.bank_name}
                    <br />
                    {review.current.account_number_masked}
                    <br />
                    {review.current.account_holder_name}
                  </p>
                ) : (
                  <p className="mt-1 text-slate-600">Belum ada</p>
                )}
              </div>
              <div className="rounded-lg bg-indigo-50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-indigo-700">Diajukan</p>
                <p className="mt-1">
                  {review.proposed.bank_name}
                  <br />
                  {review.proposed.account_number_masked}
                  <br />
                  {review.proposed.account_holder_name}
                </p>
              </div>
            </div>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-700">Berlaku mulai (effective_from)</span>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-slate-700">Alasan penolakan (wajib jika tolak)</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Isi jika menolak pengajuan"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busyId === review.id}
                onClick={() => void approve(review.id)}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Setujui
              </button>
              <button
                type="button"
                disabled={busyId === review.id}
                onClick={() => void reject(review.id)}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
