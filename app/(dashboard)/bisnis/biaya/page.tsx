"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Wallet, Plus, Search, X, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, Trash2, TrendingDown, Calendar, Receipt,
} from "lucide-react";
import {
  fetchExpenses,
  createExpense,
  deleteExpense,
  fetchAllSuppliers,
  fetchPaymentMethods,
  fetchStores,
} from "@/lib/bisnis/client";
import { fetchCashAccounts } from "@/lib/bisnis/cash-client";
import { pickPrimaryCashAccountId } from "@/lib/bisnis/entity-modules";
import { useWorkContext } from "@/components/WorkContextProvider";
import { warehousesForStore } from "@/lib/tenant/warehouses-for-store";
import { assertDocNoAvailable, BIZ_DOC_NUMBER_CONFIG, nextDocNoFor } from "@/lib/bisnis/doc-number";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type {
  CashAccount,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  Store,
  Supplier,
  PaymentMethodSetting,
} from "@/lib/bisnis/types";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  operasional: "Operasional",
  gaji: "Gaji & Upah",
  sewa: "Sewa",
  utilitas: "Utilitas (Listrik/Air/Internet)",
  transportasi: "Transportasi",
  marketing: "Marketing & Promosi",
  marketplace: "Biaya Marketplace",
  perlengkapan: "Perlengkapan & ATK",
  penyusutan: "Penyusutan Aset",
  pajak: "Pajak",
  asuransi: "Asuransi",
  lainnya: "Lainnya",
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  operasional: "bg-blue-100 text-blue-700",
  gaji: "bg-purple-100 text-purple-700",
  sewa: "bg-amber-100 text-amber-700",
  utilitas: "bg-cyan-100 text-cyan-700",
  transportasi: "bg-green-100 text-green-700",
  marketing: "bg-pink-100 text-pink-700",
  marketplace: "bg-violet-100 text-violet-700",
  perlengkapan: "bg-slate-100 text-slate-700",
  penyusutan: "bg-orange-100 text-orange-700",
  pajak: "bg-red-100 text-red-700",
  asuransi: "bg-teal-100 text-teal-700",
  lainnya: "bg-gray-100 text-gray-700",
};

const PER_PAGE = 20;

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: "Draft",
  approved: "Disetujui",
  paid: "Sudah Dibayar",
  cancelled: "Dibatalkan",
};

export default function BiayaPage() {
  const { context: workCtx } = useWorkContext();
  const companyId = workCtx?.companyId;
  const [data, setData] = useState<Expense[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSetting[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string; store?: string }[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    expense_no: "",
    category: "operasional" as ExpenseCategory,
    description: "",
    amount: 0,
    tax_amount: 0,
    expense_date: new Date().toISOString().slice(0, 10),
    payment_method: "",
    supplier: "",
    reference_no: "",
    notes: "",
    store: "",
    warehouse: "",
    cash_account: "",
    status: "paid" as ExpenseStatus,
  });

  const scopedWarehouses = form.store
    ? warehousesForStore(form.store, stores, warehouses)
    : warehouses;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: string[] = [];
      if (search) filters.push(`(expense_no ~ "${search}" || description ~ "${search}")`);
      if (categoryFilter !== "all") filters.push(`category = "${categoryFilter}"`);

      const result = await fetchExpenses({
        page,
        perPage: PER_PAGE,
        sort: "-expense_date,-created",
        filter: filters.join(" && "),
        expand: "supplier,created_by,store,warehouse,cash_account",
        companyId,
      });
      setData(result.items);
      setTotalItems(result.totalItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data biaya");
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, companyId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [search, categoryFilter]);

  const openModal = async () => {
    let expenseNo = "";
    try {
      expenseNo = await nextDocNoFor("exp");
    } catch {
      expenseNo = "";
    }
    const defaultStore =
      (workCtx?.storeId && stores.some((s) => s.id === workCtx.storeId) ? workCtx.storeId : "") ||
      stores[0]?.id ||
      "";
    const defaultWh =
      workCtx?.warehouseId ||
      stores.find((s) => s.id === defaultStore)?.default_warehouse ||
      "";
    setForm({
      expense_no: expenseNo,
      category: "operasional",
      description: "",
      amount: 0,
      tax_amount: 0,
      expense_date: new Date().toISOString().slice(0, 10),
      payment_method: "",
      supplier: "",
      reference_no: "",
      notes: "",
      store: defaultStore,
      warehouse: defaultWh,
      cash_account: pickPrimaryCashAccountId(cashAccounts),
      status: "paid",
    });
    setFormError(null);
    setShowModal(true);
    try {
      const [s, pm, st, ca, wh] = await Promise.all([
        fetchAllSuppliers(),
        fetchPaymentMethods().catch(() => [] as PaymentMethodSetting[]),
        fetchStores(false, companyId),
        fetchCashAccounts(true, companyId).catch(() => [] as CashAccount[]),
        pb.collection(INV_COLLECTIONS.warehouses)
          .getFullList<{ id: string; name: string; code: string; store?: string; company?: string }>({
            filter: companyId ? `company = "${companyId}"` : undefined,
            sort: "name",
            requestKey: null,
          })
          .catch(() => []),
      ]);
      setSuppliers(s);
      setPaymentMethods(pm);
      setStores(st);
      setCashAccounts(ca);
      setWarehouses(wh);
      setForm((f) => ({ ...f, cash_account: pickPrimaryCashAccountId(ca) }));
    } catch {
      setSuppliers([]);
    }
  };

  useEffect(() => {
    Promise.all([
      fetchStores(false, companyId).catch(() => [] as Store[]),
      fetchCashAccounts(true, companyId).catch(() => [] as CashAccount[]),
      pb.collection(INV_COLLECTIONS.warehouses)
        .getFullList<{ id: string; name: string; code: string; store?: string }>({
          filter: companyId ? `company = "${companyId}"` : undefined,
          sort: "name",
          requestKey: null,
        })
        .catch(() => []),
    ]).then(([st, ca, wh]) => {
      setStores(st);
      setCashAccounts(ca);
      setWarehouses(wh);
    });
  }, [companyId]);

  const handleCreate = async () => {
    if (!form.description || form.amount <= 0 || !form.expense_date) {
      setFormError("Deskripsi, jumlah, dan tanggal wajib diisi");
      return;
    }
    if (!form.store) {
      setFormError("Toko wajib dipilih");
      return;
    }
    if (form.status === "paid" && !form.cash_account) {
      setFormError("Akun kas/bank wajib dipilih untuk biaya yang sudah dibayar");
      return;
    }
    const expenseNo = form.expense_no.trim();
    if (!expenseNo) {
      setFormError("Nomor biaya wajib diisi");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await assertDocNoAvailable(BIZ_DOC_NUMBER_CONFIG.exp, expenseNo);
      await createExpense({
        expense_no: expenseNo,
        category: form.category,
        description: form.description,
        amount: form.amount,
        tax_amount: form.tax_amount,
        total: form.amount + form.tax_amount,
        expense_date: form.expense_date,
        payment_method: form.payment_method,
        supplier: form.supplier || undefined,
        reference_no: form.reference_no || undefined,
        notes: form.notes || undefined,
        store: form.store,
        warehouse: form.warehouse || undefined,
        cash_account: form.cash_account || undefined,
        status: form.status,
        created_by: pb.authStore.model?.id as string,
      });
      setShowModal(false);
      loadData();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? JSON.stringify((e as Record<string, unknown>).response)
          : e instanceof Error ? e.message : "Gagal mencatat biaya";
      setFormError(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus pencatatan biaya ini?")) return;
    try {
      await deleteExpense(id);
      loadData();
    } catch {
      alert("Gagal menghapus biaya");
    }
  };

  const totalBiaya = data.reduce((s, e) => s + (e.total ?? 0), 0);
  const biayaBulanIni = data.filter((e) => {
    const now = new Date();
    const d = new Date(e.expense_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, e) => s + (e.total ?? 0), 0);
  const totalPages = Math.ceil(totalItems / PER_PAGE);

  const topCategory = (() => {
    const map = new Map<string, number>();
    data.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + (e.total ?? 0)));
    let top = { cat: "-", val: 0 };
    map.forEach((v, k) => { if (v > top.val) top = { cat: k, val: v }; });
    return CATEGORY_LABELS[top.cat as ExpenseCategory] ?? "-";
  })();

  return (
    <div className="min-h-screen space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pencatatan Biaya</h1>
            <p className="text-sm text-slate-500">
              {workCtx?.companyName
                ? `Biaya operasional — ${workCtx.companyName}`
                : "Catat dan kelola pengeluaran bisnis Anda"}
            </p>
          </div>
        </div>
        <button type="button" onClick={openModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700">
          <Plus className="h-4 w-4" />
          Catat Biaya Baru
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Biaya" value={fmt(totalBiaya)} sub="Semua pengeluaran" icon={TrendingDown} color="red" />
        <StatCard label="Bulan Ini" value={fmt(biayaBulanIni)} sub={new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })} icon={Calendar} color="amber" />
        <StatCard label="Jumlah Transaksi" value={String(totalItems)} sub="Total pencatatan" icon={Receipt} color="blue" />
        <StatCard label="Kategori Terbesar" value={topCategory} sub="Pengeluaran tertinggi" icon={Wallet} color="purple" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Daftar Biaya</h2>
            <p className="text-xs text-slate-500">{totalItems} pencatatan</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Cari biaya…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 sm:w-56" />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | "all")}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100">
              <option value="all">Semua Kategori</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-red-500" />
            <span className="ml-2 text-sm text-slate-500">Memuat data…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={loadData} className="mt-1 text-sm font-medium text-red-600 hover:text-red-700">Coba lagi</button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-6">No.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Kategori</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Deskripsi</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 lg:table-cell">Toko</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 md:table-cell">Pemasok</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 md:table-cell">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Jumlah</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-6">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-400">Belum ada pencatatan biaya.</td></tr>
                  ) : (
                    data.map((e) => (
                      <tr key={e.id} className="transition hover:bg-slate-50/50">
                        <td className="whitespace-nowrap px-4 py-3.5 sm:px-6">
                          <span className="font-mono text-xs font-semibold text-red-600">{e.expense_no}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                          {e.expense_date ? new Date(e.expense_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[e.category] ?? "bg-gray-100 text-gray-700"}`}>
                            {CATEGORY_LABELS[e.category] ?? e.category}
                          </span>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3.5 text-slate-800">{e.description}</td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 text-slate-500 lg:table-cell">
                          {e.expand?.store?.name ?? "—"}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 text-slate-500 md:table-cell">
                          {e.expand?.supplier?.name ?? "—"}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {STATUS_LABELS[e.status] ?? e.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-red-700">{fmt(e.total ?? 0)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
                          <button type="button" onClick={() => handleDelete(e.id)}
                            className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
                <p className="text-xs text-slate-500">Halaman {page} dari {totalPages}</p>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                    className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                    className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Modal Catat Biaya ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Catat Biaya Baru</h2>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
              {formError && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{formError}</div>}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">No. Biaya</label>
                    <input
                      type="text"
                      value={form.expense_no}
                      onChange={(e) => setForm((f) => ({ ...f, expense_no: e.target.value }))}
                      required
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    />
                    <p className="mt-1 text-xs text-slate-500">Urut EXP-0001 … EXP-9999 (lalu reset); isi manual jika perlu.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal <span className="text-red-500">*</span></label>
                    <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100" />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kategori <span className="text-red-500">*</span></label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Toko <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={form.store}
                      onChange={(e) => {
                        const storeId = e.target.value;
                        const st = stores.find((s) => s.id === storeId);
                        setForm((f) => ({
                          ...f,
                          store: storeId,
                          warehouse: st?.default_warehouse || "",
                        }));
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    >
                      <option value="">Pilih toko</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Gudang</label>
                    <select
                      value={form.warehouse}
                      onChange={(e) => setForm((f) => ({ ...f, warehouse: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    >
                      <option value="">— Default toko —</option>
                      {scopedWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ExpenseStatus }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    >
                      <option value="paid">Sudah Dibayar (kurangi kas)</option>
                      <option value="approved">Disetujui (tanpa kas)</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Akun Kas/Bank {form.status === "paid" && <span className="text-red-500">*</span>}
                    </label>
                    <select
                      value={form.cash_account}
                      onChange={(e) => setForm((f) => ({ ...f, cash_account: e.target.value }))}
                      required={form.status === "paid"}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    >
                      <option value="">Pilih akun</option>
                      {cashAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                      ))}
                    </select>
                  </div>
                </div>
                {form.status === "paid" && cashAccounts.length === 0 && (
                  <p className="text-xs text-amber-700">
                    Belum ada akun kas untuk entitas ini. Tambahkan di Keuangan → Kas & Bank.
                  </p>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi <span className="text-red-500">*</span></label>
                  <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Contoh: Bayar listrik kantor bulan Mei"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Jumlah (Rp) <span className="text-red-500">*</span></label>
                    <input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Math.max(0, Number(e.target.value)) }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Pajak (Rp)</label>
                    <input type="number" min={0} value={form.tax_amount} onChange={(e) => setForm((f) => ({ ...f, tax_amount: Math.max(0, Number(e.target.value)) }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100" />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Total Biaya</span>
                    <span className="font-bold text-red-700">{fmt(form.amount + form.tax_amount)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Metode Bayar</label>
                    <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100">
                      <option value="">Pilih metode</option>
                      {paymentMethods.map((m) => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Pemasok</label>
                    <select value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100">
                      <option value="">Tidak ada</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">No. Referensi</label>
                  <input type="text" value={form.reference_no} onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))}
                    placeholder="No. kwitansi / bukti bayar"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Catatan tambahan (opsional)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={submitting || (form.status === "paid" && cashAccounts.length === 0)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Biaya
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "red" | "amber" | "blue" | "purple";
}) {
  const bg: Record<string, string> = {
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1.5 truncate text-xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{sub}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
