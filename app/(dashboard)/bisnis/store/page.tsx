"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Store as StoreIcon, Plus, Pencil, Trash2, X, Loader2,
  MapPin, Warehouse, ImagePlus, CheckCircle2,
} from "lucide-react";
import type { CompanyProfile, Store } from "@/lib/bisnis/types";
import { fetchStores, deleteStore } from "@/lib/bisnis/client";
import { fetchCompanyProfiles } from "@/lib/bisnis/company-client";
import { useWorkContext } from "@/components/WorkContextProvider";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { pb } from "@/lib/pocketbase";
import { StoreAvatar } from "@/components/bisnis/StoreAvatar";
import { clearPrimaryStoreFlag } from "@/lib/bisnis/entity-modules";
import { companyNameById, EntityScopeFilter } from "@/components/bisnis/EntityScopeFilter";

const EMPTY_FORM = {
  company: "",
  is_primary: false,
  name: "",
  email: "",
  address: "",
  city: "",
  phone: "",
  default_warehouse: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  npwp_display: "inherit" as "inherit" | "show" | "hide",
};

async function toWebP(file: File, maxW = 512): Promise<File> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await c.convertToBlob({ type: "image/webp", quality: 0.85 });
  return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
}

function getLogoUrl(store: Store) {
  if (!store.logo || !store.collectionId) return null;
  return pb.files.getURL(store as unknown as { id: string; collectionId: string; collectionName: string }, store.logo);
}

export default function StorePage() {
  const { context } = useWorkContext();
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [scopeCompanyId, setScopeCompanyId] = useState("");
  const [allWarehouses, setAllWarehouses] = useState<
    { id: string; code: string; name: string; company?: string; store?: string; warehouse_role?: string }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, w, c] = await Promise.all([
        fetchStores(false),
        pb.collection("inv_warehouses").getFullList<{
          id: string;
          code: string;
          name: string;
          company?: string;
          store?: string;
          warehouse_role?: string;
        }>({
          sort: "name",
          requestKey: null,
        }),
        fetchCompanyProfiles(true).catch(() => [] as CompanyProfile[]),
      ]);
      setAllStores(s);
      setAllWarehouses(w);
      setCompanies(c);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  const stores = scopeCompanyId
    ? allStores.filter((s) => s.company === scopeCompanyId)
    : allStores;
  const warehouses = scopeCompanyId
    ? allWarehouses.filter((wh) => wh.company === scopeCompanyId)
    : allWarehouses;

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, company: context?.companyId ?? companies[0]?.id ?? "" });
    setLogoFile(null);
    setLogoPreview(null);
    setShowModal(true);
  };

  const openEdit = (s: Store) => {
    setEditId(s.id);
    setForm({
      company: s.company || context?.companyId || "",
      is_primary: s.is_primary ?? false,
      name: s.name || "", email: s.email || "", address: s.address || "",
      city: s.city || "", phone: s.phone || "", default_warehouse: s.default_warehouse || "",
      bank_name: s.bank_name || "",
      bank_account_name: s.bank_account_name || "",
      bank_account_number: s.bank_account_number || "",
      npwp_display: (s.npwp_display as "inherit" | "show" | "hide") || "inherit",
    });
    setLogoFile(null);
    setLogoPreview(getLogoUrl(s));
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus toko ini?")) return;
    try { await deleteStore(id); load(); } catch { alert("Gagal menghapus toko"); }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webp = await toWebP(file);
      setLogoFile(webp);
      setLogoPreview(URL.createObjectURL(webp));
    } catch {
      alert("Gagal memproses gambar");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company) { alert("Entitas wajib dipilih"); return; }
    if (!form.default_warehouse) { alert("Gudang default wajib dipilih"); return; }
    setSubmitting(true);
    try {
      if (form.is_primary) {
        await clearPrimaryStoreFlag(form.company, editId ?? undefined);
      }
      const fd = new FormData();
      fd.append("company", form.company);
      fd.append("is_primary", form.is_primary ? "true" : "false");
      fd.append("name", form.name);
      fd.append("email", form.email);
      fd.append("address", form.address);
      fd.append("city", form.city);
      fd.append("phone", form.phone);
      fd.append("default_warehouse", form.default_warehouse);
      fd.append("bank_name", form.bank_name);
      fd.append("bank_account_name", form.bank_account_name);
      fd.append("bank_account_number", form.bank_account_number);
      fd.append("npwp_display", form.npwp_display);
      fd.append("is_active", "true");
      if (logoFile) fd.append("logo", logoFile);

      if (editId) {
        await pb.collection(BISNIS_COLLECTIONS.stores).update(editId, fd);
      } else {
        await pb.collection(BISNIS_COLLECTIONS.stores).create(fd);
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditId(null);
      setLogoFile(null);
      setLogoPreview(null);
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? JSON.stringify((err as Record<string, unknown>).response)
        : err instanceof Error ? err.message : "Gagal menyimpan";
      alert("Error: " + msg);
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key: keyof typeof EMPTY_FORM, val: string | boolean) =>
    setForm((f) => ({ ...f, [key]: val }));

  const warehousesForCompany = form.company
    ? warehouses.filter(
        (w) =>
          w.company === form.company &&
          (w.warehouse_role === "retail" || !!w.store) &&
          (!w.store || w.store === editId),
      )
    : warehouses.filter((w) => w.warehouse_role === "retail" || !!w.store);

  const activeCount = stores.filter((s) => s.is_active).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Toko</h1>
            <p className="mt-1 text-sm text-slate-500">
              Kelola toko &amp; gudang penjualan — stok jual dari gudang retail (bukan gudang entitas penerimaan).
            </p>
          </div>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Tambah Toko
          </button>
        </div>

        {!loading && companies.length > 0 ? (
          <EntityScopeFilter
            companies={companies}
            value={scopeCompanyId}
            onChange={setScopeCompanyId}
            shownCount={stores.length}
            totalCount={allStores.length}
            noun="toko"
          />
        ) : null}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                <StoreIcon className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Total Toko</p>
                <p className="text-2xl font-bold text-slate-900">{stores.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Toko Aktif</p>
                <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : stores.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <StoreIcon className="mx-auto h-12 w-12 text-slate-200" />
            <h3 className="mt-4 text-lg font-semibold text-slate-700">Belum ada toko</h3>
            <p className="mt-1 text-sm text-slate-500">Buat toko pertama untuk memulai penjualan</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((s) => {
              const wh = s.expand?.default_warehouse;
              return (
                <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <StoreAvatar store={s} size="md" />
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {s.name}
                          {s.is_primary ? (
                            <span className="ml-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                              Utama
                            </span>
                          ) : null}
                        </h3>
                        <p className="text-xs text-indigo-600">
                          {companyNameById(companies, s.company) ?? (
                            <span className="text-amber-600">Belum ada entitas</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(s)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-600" title="Hapus">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Warehouse className="h-4 w-4 text-slate-400" />
                      <span>Gudang: <span className="font-medium text-slate-800">{wh ? `${wh.code} — ${wh.name}` : "—"}</span></span>
                    </div>
                    {s.address && (
                      <div className="flex items-start gap-2 text-slate-600">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span>{s.address}{s.city ? `, ${s.city}` : ""}</span>
                      </div>
                    )}
                    {s.phone && (
                      <div className="text-slate-600">
                        <span className="text-xs text-slate-400">Telp:</span> {s.phone}
                      </div>
                    )}
                    {s.email && (
                      <div className="text-slate-600">
                        <span className="text-xs text-slate-400">Email:</span> {s.email}
                      </div>
                    )}
                    {(s.bank_name || s.bank_account_number) && (
                      <div className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                        <p className="font-medium text-slate-700">{s.bank_name || "Bank"}</p>
                        <p>{s.bank_account_number || "—"}</p>
                        {s.bank_account_name && <p>a.n. {s.bank_account_name}</p>}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      s.is_active ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" : "bg-slate-100 text-slate-500"
                    }`}>
                      {s.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                    <Link
                      href={`/katalog/akun-mp?store=${encodeURIComponent(s.id)}`}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Akun MP →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Modal Create/Edit ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-slate-900">{editId ? "Edit Toko" : "Tambah Toko"}</h2>
              <button onClick={() => { setShowModal(false); setEditId(null); setLogoFile(null); setLogoPreview(null); }}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5">
              {/* Logo Upload */}
              <div className="mb-5">
                <label className="mb-2 block text-sm font-medium text-slate-700">Logo Toko</label>
                <div className="flex items-center gap-4">
                  <div
                    onClick={() => logoRef.current?.click()}
                    className="relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-indigo-400 hover:bg-indigo-50"
                  >
                    {logoPreview ? (
                      <img src={logoPreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-6 w-6 text-slate-400" />
                    )}
                  </div>
                  <div className="text-sm">
                    <button type="button" onClick={() => logoRef.current?.click()}
                      className="font-medium text-indigo-600 hover:text-indigo-700">
                      {logoPreview ? "Ganti Logo" : "Upload Logo"}
                    </button>
                    <p className="mt-0.5 text-xs text-slate-400">JPG, PNG — auto convert ke WebP</p>
                    {logoPreview && (
                      <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                        className="mt-1 text-xs text-red-500 hover:text-red-600">Hapus logo</button>
                    )}
                  </div>
                </div>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {companies.length > 0 && (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Entitas <span className="text-red-500">*</span></label>
                    {editId ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {companies.find((c) => c.id === form.company)?.company_name ?? "—"}
                        <span className="ml-2 text-xs text-slate-400">(terkunci)</span>
                      </div>
                    ) : (
                      <select
                        required
                        value={form.company}
                        onChange={(e) => {
                          const company = e.target.value;
                          setForm((f) => ({
                            ...f,
                            company,
                            default_warehouse: warehouses.some(
                              (w) => w.id === f.default_warehouse && w.company === company,
                            )
                              ? f.default_warehouse
                              : "",
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Pilih entitas</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code ? `${c.code} — ` : ""}{c.company_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_primary}
                      onChange={(e) => set("is_primary", e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span>
                      <span className="font-medium text-slate-700">Toko utama entitas</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Default konteks kerja & tampilan invoice entitas ini.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nama Toko <span className="text-red-500">*</span></label>
                  <input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Toko Pusat"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Gudang Penjualan Default <span className="text-red-500">*</span>
                  </label>
                  <select required value={form.default_warehouse} onChange={(e) => set("default_warehouse", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="">Pilih gudang penjualan</option>
                    {warehousesForCompany.map((w) => (
                      <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    Gudang untuk stok penjualan / POS. Buat gudang penjualan tambahan di{" "}
                    <Link href="/gudang/daftar" className="text-indigo-600 hover:underline">
                      Daftar Gudang
                    </Link>
                    .
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Alamat</label>
                  <input value={form.address} onChange={(e) => set("address", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kota</label>
                  <input value={form.city} onChange={(e) => set("city", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Telepon</label>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input value={form.email} onChange={(e) => set("email", e.target.value)}
                    placeholder="sales@tokokamu.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nama Bank</label>
                  <input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)}
                    placeholder="BCA / Mandiri / BNI"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nomor Rekening</label>
                  <input value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)}
                    placeholder="1234567890"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nama Pemilik Rekening</label>
                  <input value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)}
                    placeholder="PT ... / Nama pemilik akun"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Tampilan NPWP di dokumen</label>
                  <select value={form.npwp_display} onChange={(e) => set("npwp_display", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="inherit">Ikuti pengaturan perusahaan</option>
                    <option value="show">Selalu tampilkan</option>
                    <option value="hide">Sembunyikan</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => { setShowModal(false); setEditId(null); setLogoFile(null); setLogoPreview(null); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Batal</button>
                <button type="submit" disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editId ? "Simpan Perubahan" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
