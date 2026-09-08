"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvWarehouse } from "@/lib/inventory/types";
import { Loader2, Plus, Pencil, Trash2, Warehouse, X, Store, ArrowRightLeft, PackageOpen, AlertTriangle } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";
import { useWorkContext } from "@/components/WorkContextProvider";
import { fetchCompanyProfiles } from "@/lib/bisnis/company-client";
import { fetchStores } from "@/lib/bisnis/client";
import type { CompanyProfile, Store as BizStore } from "@/lib/bisnis/types";
import { assertSingleEntityWarehouse, assertSingleTransitWarehouse, assertSingleDamagedWarehouse } from "@/lib/bisnis/entity-modules";
import {
  resolveWarehouseKind,
  warehouseKindToRole,
  WAREHOUSE_KIND_DESCRIPTIONS,
  WAREHOUSE_KIND_LABELS,
  WAREHOUSE_KIND_DEFAULT_NAMES,
  type WarehouseKind,
} from "@/lib/bisnis/warehouse-categories";
import { EntityScopeFilter } from "@/components/bisnis/EntityScopeFilter";

type WarehouseRow = InvWarehouse & {
  address?: string;
  company?: string;
  store?: string;
  warehouse_role?: string;
  is_primary?: boolean;
};

type FormState = {
  code: string;
  name: string;
  address: string;
  is_active: boolean;
  company: string;
  store: string;
  kind: WarehouseKind;
};

const EMPTY: FormState = {
  code: "",
  name: "",
  address: "",
  is_active: true,
  company: "",
  store: "",
  kind: "entity",
};

function kindBadge(kind: WarehouseKind) {
  const styles: Record<WarehouseKind, string> = {
    entity: "bg-violet-100 text-violet-800",
    sales: "bg-cyan-100 text-cyan-800",
    transit: "bg-amber-100 text-amber-800",
    damaged: "bg-rose-100 text-rose-800",
  };
  return styles[kind];
}

function kindIconStyles(kind: WarehouseKind) {
  const styles: Record<WarehouseKind, { bg: string; icon: string }> = {
    entity: { bg: "bg-violet-50", icon: "text-violet-600" },
    sales: { bg: "bg-cyan-50", icon: "text-cyan-600" },
    transit: { bg: "bg-amber-50", icon: "text-amber-600" },
    damaged: { bg: "bg-rose-50", icon: "text-rose-600" },
  };
  return styles[kind];
}

function modalHintStyles(kind: WarehouseKind) {
  const styles: Record<WarehouseKind, string> = {
    entity: "border-violet-200 bg-violet-50 text-violet-900",
    sales: "border-cyan-200 bg-cyan-50 text-cyan-900",
    transit: "border-amber-200 bg-amber-50 text-amber-900",
    damaged: "border-rose-200 bg-rose-50 text-rose-900",
  };
  return styles[kind];
}

function modalTitle(editId: string | null, kind: WarehouseKind) {
  if (editId) return "Edit Gudang";
  const titles: Record<WarehouseKind, string> = {
    entity: "Gudang Entitas Baru",
    sales: "Gudang Penjualan Baru",
    transit: "Gudang Sementara Baru",
    damaged: "Gudang Rusak Baru",
  };
  return titles[kind];
}

export default function DaftarGudangPage() {
  const { context: workCtx } = useWorkContext();
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [stores, setStores] = useState<BizStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<WarehouseRow[]>([]);
  const [scopeCompanyId, setScopeCompanyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, co, st] = await Promise.all([
        pb.collection(INV_COLLECTIONS.warehouses).getFullList<WarehouseRow>({
          sort: "code",
          requestKey: null,
        }),
        fetchCompanyProfiles(true).catch(() => [] as CompanyProfile[]),
        fetchStores(false).catch(() => [] as BizStore[]),
      ]);
      setAllItems(res);
      setCompanies(co);
      setStores(st);
    } finally {
      setLoading(false);
    }
  }, []);

  const items = scopeCompanyId
    ? allItems.filter((w) => w.company === scopeCompanyId)
    : allItems;

  const entityItems = useMemo(
    () => items.filter((w) => resolveWarehouseKind(w) === "entity"),
    [items],
  );
  const salesItems = useMemo(
    () => items.filter((w) => resolveWarehouseKind(w) === "sales"),
    [items],
  );
  const transitItems = useMemo(
    () => items.filter((w) => resolveWarehouseKind(w) === "transit"),
    [items],
  );
  const damagedItems = useMemo(
    () => items.filter((w) => resolveWarehouseKind(w) === "damaged"),
    [items],
  );

  const storesForCompany = useMemo(
    () => (form.company ? stores.filter((s) => s.company === form.company && s.is_active !== false) : []),
    [form.company, stores],
  );

  const entityExistsForCompany = useMemo(
    () =>
      form.company
        ? allItems.some(
            (w) =>
              w.company === form.company &&
              w.is_active !== false &&
              resolveWarehouseKind(w) === "entity" &&
              w.id !== editId,
          )
        : false,
    [allItems, form.company, editId],
  );

  const transitExistsForCompany = useMemo(
    () =>
      form.company
        ? allItems.some(
            (w) =>
              w.company === form.company &&
              w.is_active !== false &&
              resolveWarehouseKind(w) === "transit" &&
              w.id !== editId,
          )
        : false,
    [allItems, form.company, editId],
  );

  const damagedExistsForCompany = useMemo(
    () =>
      form.company
        ? allItems.some(
            (w) =>
              w.company === form.company &&
              w.is_active !== false &&
              resolveWarehouseKind(w) === "damaged" &&
              w.id !== editId,
          )
        : false,
    [allItems, form.company, editId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = (kind: WarehouseKind) => {
    const defaultCompany = workCtx?.companyId ?? companies[0]?.id ?? "";
    setEditId(null);
    setForm({
      ...EMPTY,
      kind,
      name: WAREHOUSE_KIND_DEFAULT_NAMES[kind],
      company: defaultCompany,
      store:
        kind === "sales"
          ? (stores.find((s) => s.company === defaultCompany)?.id ?? "")
          : "",
    });
    setError("");
    setModal(true);
  };

  const openEdit = (w: WarehouseRow) => {
    const kind = resolveWarehouseKind(w);
    setEditId(w.id);
    setForm({
      code: w.code,
      name: w.name,
      address: w.address || "",
      company: w.company ?? workCtx?.companyId ?? "",
      store: w.store ?? "",
      kind,
      is_active: w.is_active !== false,
    });
    setError("");
    setModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!form.company) {
        setError("Entitas wajib dipilih");
        setSaving(false);
        return;
      }
      if (form.kind === "sales" && !form.store) {
        setError("Gudang penjualan wajib dipilih tokonya");
        setSaving(false);
        return;
      }
      if (form.kind === "entity" && !editId) {
        await assertSingleEntityWarehouse(form.company);
      }
      if (form.kind === "transit" && !editId) {
        await assertSingleTransitWarehouse(form.company);
      }
      if (form.kind === "damaged" && !editId) {
        await assertSingleDamagedWarehouse(form.company);
      }
      const role = warehouseKindToRole(form.kind);
      if (editId) {
        await pb.collection(INV_COLLECTIONS.warehouses).update(editId, {
          code: form.code.trim().toUpperCase() || form.name.trim().toUpperCase().slice(0, 8),
          name: form.name.trim(),
          address: form.address.trim(),
          warehouse_role: role,
          is_primary: form.kind === "entity",
          store: form.kind === "sales" ? form.store : "",
          is_active: form.is_active,
          timezone: "Asia/Jakarta",
        });
      } else {
        const res = await fetch("/api/inventory/warehouses", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            code: form.code.trim() || undefined,
            address: form.address.trim(),
            company: form.company,
            store: form.kind === "sales" ? form.store : undefined,
            warehouse_role: role,
            is_primary: form.kind === "entity",
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || "Gagal membuat gudang");
        }
      }
      setModal(false);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Gagal menyimpan"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus gudang ini?")) return;
    setDeleting(id);
    try {
      await pb.collection(INV_COLLECTIONS.warehouses).delete(id);
      await load();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Gagal menghapus"));
    } finally {
      setDeleting(null);
    }
  };

  const storeName = (id?: string) => stores.find((s) => s.id === id)?.name;

  const renderCard = (w: WarehouseRow) => {
    const kind = resolveWarehouseKind(w);
    const iconStyles = kindIconStyles(kind);
    const CardIcon =
      kind === "transit" ? PackageOpen : kind === "damaged" ? AlertTriangle : Warehouse;
    return (
      <div
        key={w.id}
        className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconStyles.bg}`}
            >
              <CardIcon className={`h-5 w-5 ${iconStyles.icon}`} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{w.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${kindBadge(kind)}`}>
                  {WAREHOUSE_KIND_LABELS[kind]}
                </span>
              </div>
              <p className="font-mono text-xs text-slate-400">{w.code}</p>
              {w.company ? (
                <p className="text-xs text-indigo-600">
                  {companies.find((c) => c.id === w.company)?.company_name ?? "Entitas"}
                </p>
              ) : null}
              {kind === "sales" && w.store ? (
                <p className="flex items-center gap-1 text-xs text-cyan-700">
                  <Store className="h-3 w-3" />
                  Toko: {storeName(w.store) ?? w.store}
                </p>
              ) : null}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${w.is_active !== false ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
          >
            {w.is_active !== false ? "Aktif" : "Nonaktif"}
          </span>
        </div>
        {w.address ? <p className="mt-3 text-sm text-slate-500">{w.address}</p> : null}
        <div className="mt-4 flex gap-2 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => openEdit(w)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            type="button"
            onClick={() => void handleDelete(w.id)}
            disabled={deleting === w.id}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {deleting === w.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}{" "}
            Hapus
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Warehouse className="h-6 w-6 text-indigo-600" /> Daftar Gudang
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            <strong>Gudang entitas</strong> (satu per PT/CV) hanya untuk penerimaan pembelian — stok ke toko via{" "}
            <Link href="/inventory/movements/new" className="font-medium text-indigo-600 hover:underline">
              Transfer Gudang
            </Link>
            . <strong>Gudang penjualan</strong> terikat toko untuk SO, POS, dan online.{" "}
            <strong>Gudang sementara</strong> menampung barang belum QC atau retur belum disortir;{" "}
            <strong>gudang rusak</strong> untuk karantina barang cacat (masing-masing satu per entitas).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openNew("entity")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" /> Gudang Entitas
          </button>
          <button
            type="button"
            onClick={() => openNew("sales")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" /> Gudang Penjualan
          </button>
          <button
            type="button"
            onClick={() => openNew("transit")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
          >
            <Plus className="h-4 w-4" /> Gudang Sementara
          </button>
          <button
            type="button"
            onClick={() => openNew("damaged")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
          >
            <Plus className="h-4 w-4" /> Gudang Rusak
          </button>
        </div>
      </div>

      {!loading && companies.length > 0 ? (
        <EntityScopeFilter
          companies={companies}
          value={scopeCompanyId}
          onChange={setScopeCompanyId}
          shownCount={items.length}
          totalCount={allItems.length}
          noun="gudang"
        />
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Warehouse className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Belum ada gudang. Tambahkan gudang entitas, penjualan, sementara, atau rusak sesuai kebutuhan entitas.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-800">
                Gudang Entitas
              </h2>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                {entityItems.length}
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500">{WAREHOUSE_KIND_DESCRIPTIONS.entity}</p>
            {entityItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-violet-200 bg-violet-50/50 px-4 py-3 text-sm text-violet-800">
                Belum ada gudang entitas untuk filter ini. Buat lewat Pengaturan → Perusahaan atau tombol di atas.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">{entityItems.map(renderCard)}</div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-800">Gudang Penjualan</h2>
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">
                {salesItems.length}
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500">{WAREHOUSE_KIND_DESCRIPTIONS.sales}</p>
            {salesItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-cyan-200 bg-cyan-50/50 px-4 py-3 text-sm text-cyan-900">
                Belum ada gudang penjualan. Buat gudang penjualan dan tautkan ke toko (mis. online vs POS per kota).
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">{salesItems.map(renderCard)}</div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-800">
                Gudang Sementara
              </h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {transitItems.length}
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500">{WAREHOUSE_KIND_DESCRIPTIONS.transit}</p>
            {transitItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-900">
                Belum ada gudang sementara. Buat satu per entitas untuk penampung QC penerimaan dan retur belum
                disortir.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">{transitItems.map(renderCard)}</div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-800">Gudang Rusak</h2>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                {damagedItems.length}
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500">{WAREHOUSE_KIND_DESCRIPTIONS.damaged}</p>
            {damagedItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-900">
                Belum ada gudang rusak. Buat satu per entitas untuk karantina barang cacat sebelum kanibal atau
                pembuangan.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">{damagedItems.map(renderCard)}</div>
            )}
          </section>
        </div>
      )}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{modalTitle(editId, form.kind)}</h3>
              <button type="button" onClick={() => setModal(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 space-y-4">
              <p className={`rounded-lg border px-3 py-2 text-xs ${modalHintStyles(form.kind)}`}>
                {WAREHOUSE_KIND_DESCRIPTIONS[form.kind]}
              </p>

              {companies.length > 0 && (
                <label className="block text-sm font-medium text-slate-700">
                  Entitas (PT/CV) <span className="text-red-500">*</span>
                  {editId ? (
                    <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {companies.find((c) => c.id === form.company)?.company_name ?? "—"}
                      <span className="ml-2 text-xs text-slate-400">(terkunci)</span>
                    </div>
                  ) : (
                    <select
                      required
                      value={form.company}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          company: e.target.value,
                          store: "",
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Pilih entitas</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code ? `${c.code} — ` : ""}
                          {c.company_name}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              )}

              {form.kind === "sales" ? (
                <label className="block text-sm font-medium text-slate-700">
                  Toko <span className="text-red-500">*</span>
                  <select
                    required
                    value={form.store}
                    onChange={(e) => setForm({ ...form, store: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Pilih toko</option>
                    {storesForCompany.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {form.company && storesForCompany.length === 0 ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Belum ada toko untuk entitas ini — buat di{" "}
                      <Link href="/bisnis/store" className="font-semibold underline">
                        Pengaturan → Toko
                      </Link>
                      .
                    </p>
                  ) : null}
                </label>
              ) : null}

              {form.kind === "entity" && entityExistsForCompany && !editId ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Entitas ini sudah punya gudang entitas. Gunakan gudang penjualan untuk stok toko.
                </p>
              ) : null}

              {form.kind === "transit" && transitExistsForCompany && !editId ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Entitas ini sudah punya gudang sementara. Satu entitas = satu gudang sementara.
                </p>
              ) : null}

              {form.kind === "damaged" && damagedExistsForCompany && !editId ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Entitas ini sudah punya gudang rusak. Satu entitas = satu gudang rusak.
                </p>
              ) : null}

              <label className="block text-sm font-medium text-slate-700">
                Nama Gudang <span className="text-red-500">*</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder={
                    form.kind === "sales"
                      ? "Gudang Online / POS Jakarta"
                      : WAREHOUSE_KIND_DEFAULT_NAMES[form.kind]
                  }
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Kode Gudang <span className="font-normal text-slate-400">(opsional)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Otomatis dari nama"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Alamat
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Jl. Contoh No. 1"
                />
              </label>
              {editId ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Aktif
                </label>
              ) : null}
              {form.kind === "entity" || form.kind === "transit" || form.kind === "damaged" ? (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Pindah stok antar gudang:{" "}
                  <Link href="/inventory/movements/new" className="font-medium text-indigo-600 hover:underline">
                    Transfer Gudang
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={
                  saving ||
                  (form.kind === "entity" && entityExistsForCompany && !editId) ||
                  (form.kind === "transit" && transitExistsForCompany && !editId) ||
                  (form.kind === "damaged" && damagedExistsForCompany && !editId)
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editId ? "Simpan" : "Tambah"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
