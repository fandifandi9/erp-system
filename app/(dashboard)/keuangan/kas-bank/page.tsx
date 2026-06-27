"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, X, Loader2, Landmark, Building2, Wallet } from "lucide-react";
import { fetchStores } from "@/lib/bisnis/client";
import { fetchCompanyProfiles } from "@/lib/bisnis/company-client";
import { useWorkContext } from "@/components/WorkContextProvider";
import {
  fetchCashAccounts,
  createCashAccount,
  updateCashAccount,
  deleteCashAccount,
} from "@/lib/bisnis/cash-client";
import type { CashAccount, CashAccountType, CompanyProfile, Store } from "@/lib/bisnis/types";
import { CASH_ACCOUNT_TYPE_LABELS } from "@/lib/bisnis/types";
import { KeuanganSubpageShell } from "@/components/keuangan/KeuanganSubpageShell";
import { computeCashAccountBalances } from "@/lib/bisnis/cash-balance";
import { clearPrimaryCashFlag, assertSingleCashAccountPerEntity } from "@/lib/bisnis/entity-modules";
import { companyNameById, EntityScopeFilter } from "@/components/bisnis/EntityScopeFilter";

const EMPTY = {
  code: "",
  name: "",
  account_type: "bank" as CashAccountType,
  company: "",
  is_central: false,
  store: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  opening_balance: 0,
  notes: "",
  is_primary: true,
};

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function KasBankPage() {
  const { context } = useWorkContext();
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [allAccounts, setAllAccounts] = useState<CashAccount[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [scopeCompanyId, setScopeCompanyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setSchemaMissing(false);
    try {
      const [acc, st, c] = await Promise.all([
        fetchCashAccounts(false).catch(() => {
          setSchemaMissing(true);
          return [] as CashAccount[];
        }),
        fetchStores(false),
        fetchCompanyProfiles(true).catch(() => [] as CompanyProfile[]),
      ]);
      setCompanies(c);
      setAllAccounts(acc);
      setAllStores(st);
      const bal = await computeCashAccountBalances(acc);
      setBalances(new Map([...bal.entries()].map(([id, b]) => [id, b.balance])));
    } catch (err) {
      console.error("Kas & Bank load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const accounts = scopeCompanyId
    ? allAccounts.filter((a) => a.company === scopeCompanyId)
    : allAccounts;
  const stores = scopeCompanyId
    ? allStores.filter((s) => s.company === scopeCompanyId)
    : allStores;

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditId(null);
    setForm({
      ...EMPTY,
      company: context?.companyId ?? companies[0]?.id ?? "",
      is_primary: true,
      account_type: "bank",
    });
    setShowModal(true);
  };

  const openEdit = (a: CashAccount) => {
    setEditId(a.id);
    setForm({
      code: a.code,
      name: a.name,
      account_type: a.account_type,
      company: a.company ?? context?.companyId ?? "",
      is_central: a.is_central ?? false,
      store: a.store ?? "",
      bank_name: a.bank_name ?? "",
      bank_account_name: a.bank_account_name ?? "",
      bank_account_number: a.bank_account_number ?? "",
      opening_balance: a.opening_balance ?? 0,
      notes: a.notes ?? "",
      is_primary: a.is_primary ?? false,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Nonaktifkan / hapus akun kas ini?")) return;
    try {
      await deleteCashAccount(id);
      load();
    } catch {
      alert("Gagal menghapus akun");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const companyId = form.company || context?.companyId || "";
      if (!editId && companyId) {
        await assertSingleCashAccountPerEntity(companyId);
      }
      if (companyId || form.is_primary) {
        await clearPrimaryCashFlag(companyId, editId ?? undefined);
      }
      const payload = {
        ...form,
        company: companyId || undefined,
        store: form.store || undefined,
        is_active: true,
        is_primary: companyId ? true : form.is_primary,
        account_type: companyId ? ("bank" as CashAccountType) : form.account_type,
      };
      if (editId) await updateCashAccount(editId, payload);
      else await createCashAccount(payload);
      setShowModal(false);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan";
      alert("Error: " + msg);
    } finally {
      setSubmitting(false);
    }
  };

  const storeBanks = stores.filter((s) => s.bank_name || s.bank_account_number);
  const storeNoBank = stores.filter((s) => !s.bank_name && !s.bank_account_number);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <KeuanganSubpageShell
      title="Kas & Bank"
      description="Satu rekening bank per entitas untuk pembayaran pembelian. Rekening toko legacy ditampilkan di bawah."
      action={
        !schemaMissing ? (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Tambah Akun
          </button>
        ) : null
      }
    >
      {schemaMissing ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Schema akun kas belum ada di PocketBase.</p>
          <p className="mt-1">
            Jalankan migrasi: <code className="rounded bg-white px-1.5 py-0.5 text-xs">npm run pb:cash-schema</code>
          </p>
        </div>
      ) : (
        <>
      {!schemaMissing && companies.length > 0 ? (
        <EntityScopeFilter
          companies={companies}
          value={scopeCompanyId}
          onChange={setScopeCompanyId}
          shownCount={accounts.length}
          totalCount={allAccounts.length}
          noun="akun"
        />
      ) : null}
      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Landmark className="mx-auto h-12 w-12 text-slate-200" />
          <p className="mt-4 font-medium text-slate-700">
            {allAccounts.length > 0 ? "Tidak ada akun untuk filter entitas ini" : "Belum ada akun kas terpusat"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {allAccounts.length > 0
              ? "Pilih Semua entitas di filter atas untuk melihat seluruh rekening."
              : "Tambahkan akun bank, kas tunai, atau e-wallet"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
                {a.account_type === "cash" ? (
                  <Wallet className="h-5 w-5 text-indigo-600" />
                ) : (
                  <Landmark className="h-5 w-5 text-indigo-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">
                  {a.name}{" "}
                  <span className="text-xs font-normal text-slate-400">({a.code})</span>
                  {a.is_primary ? (
                    <span className="ml-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                      Utama
                    </span>
                  ) : null}
                  {a.is_central ? (
                    <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      Kas Pusat
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-600">
                  {CASH_ACCOUNT_TYPE_LABELS[a.account_type]}
                  {a.bank_name ? ` · ${a.bank_name}` : ""}
                  {a.bank_account_number ? ` · ${a.bank_account_number}` : ""}
                </p>
                <p className="text-xs text-indigo-600">
                  Entitas: {companyNameById(companies, a.company) ?? "—"}
                </p>
                {a.expand?.store ? (
                  <p className="text-xs text-slate-500">Toko: {a.expand.store.name}</p>
                ) : null}
                <p className="text-xs font-medium text-indigo-700">
                  Saldo buku: {currency(balances.get(a.id) ?? a.opening_balance ?? 0)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="rounded-lg border border-slate-200 p-2 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(storeBanks.length > 0 || storeNoBank.length > 0) && (
        <div className="space-y-3 pt-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Rekening dari Master Toko
          </h2>
          <p className="text-xs text-slate-500">
            Data ini dari{" "}
            <Link href="/bisnis/store" className="text-indigo-600 hover:underline">
              Pengaturan Toko
            </Link>
            . Untuk akun terpusat, tambahkan di atas.
          </p>
          <div className="divide-y divide-slate-100 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
            {storeBanks.map((s) => (
              <div key={s.id} className="flex items-center gap-4 p-4">
                <Building2 className="h-5 w-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-700">{s.name}</p>
                  <p className="text-sm text-slate-600">
                    {s.bank_name ?? "—"}
                    {s.bank_account_number ? ` · ${s.bank_account_number}` : ""}
                  </p>
                </div>
              </div>
            ))}
            {storeNoBank.map((s) => (
              <div key={s.id} className="flex items-center gap-4 p-4 opacity-70">
                <Building2 className="h-5 w-5 shrink-0 text-slate-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-600">{s.name}</p>
                  <p className="text-xs text-slate-400">Rekening belum diisi</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editId ? "Edit Akun" : "Tambah Akun"}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-slate-600">Kode</span>
                  <input
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Tipe</span>
                  <select
                    value={form.account_type}
                    onChange={(e) => setForm({ ...form, account_type: e.target.value as CashAccountType })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {(Object.keys(CASH_ACCOUNT_TYPE_LABELS) as CashAccountType[]).map((k) => (
                      <option key={k} value={k}>
                        {CASH_ACCOUNT_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-slate-600">Nama akun</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              {companies.length > 0 && (
                <label className="block text-sm">
                  <span className="text-slate-600">Entitas</span>
                  {editId ? (
                    <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {companies.find((c) => c.id === form.company)?.company_name ?? "—"}
                      <span className="ml-2 text-xs text-slate-400">(terkunci)</span>
                    </div>
                  ) : (
                    <select
                      required
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Pilih entitas</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code ? `${c.code} — ` : ""}{c.company_name}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              )}
              {form.company ? (
                <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                  Rekening bank entitas — pembayaran pembelian (satu rekening per entitas).
                </p>
              ) : null}
              {!form.company ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_primary}
                    onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  <span>
                    <span className="font-medium text-slate-700">Rekening utama entitas</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Default untuk biaya operasional & pembayaran hutang entitas ini.
                    </span>
                  </span>
                </label>
              ) : null}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_central}
                  onChange={(e) => setForm({ ...form, is_central: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span>
                  <span className="font-medium text-slate-700">Kas Pusat (holding)</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Transfer antar entitas (inter-company).
                  </span>
                </span>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Toko (opsional)</span>
                <select
                  value={form.store}
                  onChange={(e) => setForm({ ...form, store: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">— Global entitas —</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {form.account_type === "bank" ? (
                <>
                  <label className="block text-sm">
                    <span className="text-slate-600">Nama bank</span>
                    <input
                      value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">No. rekening</span>
                    <input
                      value={form.bank_account_number}
                      onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Atas nama</span>
                    <input
                      value={form.bank_account_name}
                      onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                </>
              ) : null}
              <label className="block text-sm">
                <span className="text-slate-600">Saldo awal</span>
                <input
                  type="number"
                  min={0}
                  value={form.opening_balance}
                  onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Catatan</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
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
