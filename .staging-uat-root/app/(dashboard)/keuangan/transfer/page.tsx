"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, Plus, X } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import {
  fetchCashTransfers,
  createCashTransfer,
  nextCashTransferNo,
} from "@/lib/bisnis/cash-client";
import { fetchTransferEligibleAccounts } from "@/lib/bisnis/cash-transfer";
import type { CashAccount, CashTransfer } from "@/lib/bisnis/types";
import { KeuanganSubpageShell } from "@/components/keuangan/KeuanganSubpageShell";
import { useWorkContext } from "@/components/WorkContextProvider";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

function accountLabel(a: CashAccount) {
  const parts = [a.name];
  if (a.is_central) parts.push("Kas Pusat");
  return parts.join(" · ");
}

export default function TransferPage() {
  const { context: workCtx } = useWorkContext();
  const companyId = workCtx?.companyId;
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    from_account: "",
    to_account: "",
    amount: 0,
    transfer_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setSchemaMissing(false);
    try {
      const [acc, tr] = await Promise.all([
        fetchTransferEligibleAccounts(companyId).catch(() => {
          setSchemaMissing(true);
          return [] as CashAccount[];
        }),
        fetchCashTransfers(50, companyId).catch(() => ({ items: [] as CashTransfer[] })),
      ]);
      setAccounts(acc);
      setTransfers(tr.items ?? []);
    } catch (err) {
      console.error("Transfer load error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.from_account === form.to_account) {
      alert("Akun asal dan tujuan harus berbeda");
      return;
    }
    setSubmitting(true);
    try {
      const user = pb.authStore.model;
      if (!user?.id) throw new Error("Sesi login tidak valid");
      const transfer_no = await nextCashTransferNo();
      await createCashTransfer({
        ...form,
        transfer_no,
        created_by: user.id,
        initiated_company: companyId,
      });
      setShowModal(false);
      setForm({
        from_account: "",
        to_account: "",
        amount: 0,
        transfer_date: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan transfer");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <KeuanganSubpageShell
      title="Transfer Antar Akun"
      description="Transfer dalam entitas atau antar entitas via kas pusat"
      action={
        !schemaMissing && accounts.length >= 2 ? (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Transfer Baru
          </button>
        ) : null
      }
    >
      {schemaMissing ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Schema transfer belum ada.</p>
          <p className="mt-1">
            Jalankan: <code className="rounded bg-white px-1.5 py-0.5 text-xs">npm run pb:inter-company</code>
          </p>
        </div>
      ) : accounts.length < 2 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Minimal 2 akun kas aktif diperlukan. Tambahkan di{" "}
          <a href="/keuangan/kas-bank" className="font-medium text-indigo-600 hover:underline">
            Kas & Bank
          </a>
          . Untuk transfer antar PT, tandai satu akun sebagai <strong>Kas Pusat</strong>.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {transfers.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">Belum ada transfer tercatat</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {transfers.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="text-xs font-medium text-slate-400">{t.transfer_no}</span>
                  {t.transfer_kind === "inter_company" ? (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                      Antar entitas
                    </span>
                  ) : null}
                  <span className="text-sm text-slate-700">{t.expand?.from_account?.name ?? "—"}</span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                  <span className="text-sm text-slate-700">{t.expand?.to_account?.name ?? "—"}</span>
                  <span className="ml-auto text-sm font-semibold text-indigo-700">{currency(t.amount)}</span>
                  <span className="w-full text-xs text-slate-500">
                    {new Date(t.transfer_date).toLocaleDateString("id-ID")}
                    {t.notes ? ` · ${t.notes}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Transfer Baru</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Transfer antar entitas hanya jika salah satu akun adalah <strong>Kas Pusat</strong>.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm">
                <span className="text-slate-600">Dari akun</span>
                <select
                  required
                  value={form.from_account}
                  onChange={(e) => setForm({ ...form, from_account: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Pilih akun</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Ke akun</span>
                <select
                  required
                  value={form.to_account}
                  onChange={(e) => setForm({ ...form, to_account: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Pilih akun</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Jumlah</span>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.amount || ""}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Tanggal</span>
                <input
                  type="date"
                  required
                  value={form.transfer_date}
                  onChange={(e) => setForm({ ...form, transfer_date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Catatan</span>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </KeuanganSubpageShell>
  );
}
