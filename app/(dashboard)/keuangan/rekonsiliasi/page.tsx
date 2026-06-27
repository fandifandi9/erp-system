"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import {
  fetchCashAccounts,
  fetchCashReconciliations,
  createCashReconciliation,
} from "@/lib/bisnis/cash-client";
import { computeCashAccountBalances } from "@/lib/bisnis/cash-balance";
import type { CashAccount, CashReconciliation } from "@/lib/bisnis/types";
import { KeuanganSubpageShell } from "@/components/keuangan/KeuanganSubpageShell";
import { useWorkContext } from "@/components/WorkContextProvider";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function RekonsiliasiPage() {
  const { context: workCtx } = useWorkContext();
  const companyId = workCtx?.companyId;
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [balances, setBalances] = useState<Map<string, { balance: number }>>(new Map());
  const [history, setHistory] = useState<CashReconciliation[]>([]);
  const [accountId, setAccountId] = useState("");
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [statementBalance, setStatementBalance] = useState(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSchemaMissing(false);
    try {
      const acc = await fetchCashAccounts(true, companyId);
      const balMap = await computeCashAccountBalances(acc);
      setAccounts(acc);
      setBalances(balMap);
      if (acc.length > 0 && !accountId) setAccountId(acc[0].id);
      const hist = await fetchCashReconciliations(accountId || acc[0]?.id).catch(() => {
        setSchemaMissing(true);
        return { items: [] as CashReconciliation[] };
      });
      setHistory(hist.items);
    } catch {
      setSchemaMissing(true);
    } finally {
      setLoading(false);
    }
  }, [accountId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!accountId) return;
    fetchCashReconciliations(accountId)
      .then((r) => setHistory(r.items))
      .catch(() => setHistory([]));
  }, [accountId]);

  const bookBalance = accountId ? (balances.get(accountId)?.balance ?? 0) : 0;
  const difference = statementBalance - bookBalance;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    const user = pb.authStore.model;
    if (!user?.id) {
      alert("Sesi tidak valid");
      return;
    }
    setSaving(true);
    try {
      await createCashReconciliation({
        cash_account: accountId,
        statement_date: statementDate,
        statement_balance: statementBalance,
        book_balance: bookBalance,
        difference,
        notes: notes || undefined,
        created_by: user.id,
      });
      setNotes("");
      const hist = await fetchCashReconciliations(accountId);
      setHistory(hist.items);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan rekonsiliasi");
    } finally {
      setSaving(false);
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
      title="Rekonsiliasi Bank"
      description="Bandingkan saldo buku sistem dengan saldo statement bank"
    >
      {schemaMissing ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Schema belum siap.</p>
          <p className="mt-1">
            Jalankan: <code className="rounded bg-white px-1.5 py-0.5 text-xs">npm run pb:cash-schema</code> lalu{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-xs">npm run pb:company-schema</code>
          </p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Tambahkan akun kas di{" "}
          <a href="/keuangan/kas-bank" className="font-medium text-indigo-600 hover:underline">
            Kas & Bank
          </a>{" "}
          terlebih dahulu.
        </div>
      ) : (
        <>
          <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label className="block text-sm">
              <span className="text-slate-600">Akun kas / bank</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — buku {currency(balances.get(a.id)?.balance ?? 0)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Saldo buku (sistem)</p>
                <p className="text-lg font-bold text-slate-900">{currency(bookBalance)}</p>
                <p className="mt-1 text-[10px] text-slate-400">Saldo awal + transfer masuk/keluar</p>
              </div>
              <label className="block text-sm">
                <span className="text-slate-600">Saldo statement bank</span>
                <input
                  type="number"
                  required
                  value={statementBalance || ""}
                  onChange={(e) => setStatementBalance(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div
              className={
                "rounded-xl p-4 text-sm " +
                (Math.abs(difference) < 1
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-900")
              }
            >
              Selisih: <strong>{currency(difference)}</strong>
              {Math.abs(difference) < 1 ? " — cocok" : " — perlu dicek transaksi"}
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Tanggal statement</span>
              <input
                type="date"
                required
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Catatan</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opsional — sumber statement, dll."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Menyimpan…" : "Simpan rekonsiliasi"}
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-800">Riwayat rekonsiliasi</h2>
            </div>
            {history.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">Belum ada rekonsiliasi tercatat</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {history.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 text-sm">
                    <span className="text-slate-500">
                      {new Date(h.statement_date).toLocaleDateString("id-ID")}
                    </span>
                    <span>Buku {currency(h.book_balance)}</span>
                    <span>Bank {currency(h.statement_balance)}</span>
                    <span
                      className={
                        Math.abs(h.difference) < 1 ? "font-medium text-emerald-700" : "font-medium text-amber-700"
                      }
                    >
                      Δ {currency(h.difference)}
                    </span>
                    {h.notes ? <span className="text-xs text-slate-400">{h.notes}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </KeuanganSubpageShell>
  );
}
