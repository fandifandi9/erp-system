"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Truck, ChevronDown, ChevronRight } from "lucide-react";
import type { Courier, CourierService } from "@/lib/bisnis/types";
import { CourierAvatar } from "@/components/bisnis/CourierAvatar";
import { getCourierLogoUrl } from "@/lib/bisnis/courier-logo";
import {
  fetchCouriers,
  fetchCourierServices,
  createCourier,
  updateCourier,
  deleteCourier,
  createCourierService,
  updateCourierService,
  deleteCourierService,
} from "@/lib/bisnis/couriers";

const EMPTY_COURIER = { name: "", code: "", notes: "" };
const EMPTY_SERVICE = { name: "", code: "", sort_order: 0 };

async function toWebP(file: File, maxW = 256): Promise<File> {
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

export default function EkspedisiPage() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [services, setServices] = useState<CourierService[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [courierModal, setCourierModal] = useState(false);
  const [serviceModal, setServiceModal] = useState(false);
  const [editCourierId, setEditCourierId] = useState<string | null>(null);
  const [editServiceId, setEditServiceId] = useState<string | null>(null);
  const [serviceCourierId, setServiceCourierId] = useState<string | null>(null);
  const [courierForm, setCourierForm] = useState(EMPTY_COURIER);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [c, s] = await Promise.all([fetchCouriers(false), fetchCourierServices(undefined, false)]);
      setCouriers(c);
      setServices(s);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat data ekspedisi");
      setCouriers([]);
      setServices([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const servicesFor = (courierId: string) =>
    services
      .filter((s) => s.courier === courierId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "id"));

  const resetLogoState = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setRemoveLogo(false);
  };

  const openNewCourier = () => {
    setEditCourierId(null);
    setCourierForm(EMPTY_COURIER);
    resetLogoState();
    setCourierModal(true);
  };

  const openEditCourier = (c: Courier) => {
    setEditCourierId(c.id);
    setCourierForm({ name: c.name, code: c.code ?? "", notes: c.notes ?? "" });
    resetLogoState();
    setLogoPreview(getCourierLogoUrl(c));
    setCourierModal(true);
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webp = await toWebP(file);
      setLogoFile(webp);
      setLogoPreview(URL.createObjectURL(webp));
      setRemoveLogo(false);
    } catch {
      alert("Gagal memproses gambar");
    }
  };

  const openNewService = (courierId: string) => {
    setServiceCourierId(courierId);
    setEditServiceId(null);
    setServiceForm(EMPTY_SERVICE);
    setServiceModal(true);
  };

  const openEditService = (s: CourierService) => {
    setServiceCourierId(s.courier);
    setEditServiceId(s.id);
    setServiceForm({ name: s.name, code: s.code ?? "", sort_order: s.sort_order ?? 0 });
    setServiceModal(true);
  };

  const saveCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const useFormData = !!logoFile || removeLogo;
      if (useFormData) {
        const fd = new FormData();
        fd.append("name", courierForm.name.trim());
        if (courierForm.code.trim()) fd.append("code", courierForm.code.trim());
        if (courierForm.notes.trim()) fd.append("notes", courierForm.notes.trim());
        fd.append("is_active", "true");
        if (logoFile) fd.append("logo", logoFile);
        if (removeLogo) fd.append("logo", "");
        if (editCourierId) await updateCourier(editCourierId, fd);
        else await createCourier(fd);
      } else {
        const payload = {
          name: courierForm.name.trim(),
          code: courierForm.code.trim() || undefined,
          notes: courierForm.notes.trim() || undefined,
          is_active: true,
        };
        if (editCourierId) await updateCourier(editCourierId, payload);
        else await createCourier(payload);
      }
      setCourierModal(false);
      resetLogoState();
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan ekspedisi");
    } finally {
      setSubmitting(false);
    }
  };

  const saveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceCourierId) return;
    setSubmitting(true);
    try {
      const payload = {
        courier: serviceCourierId,
        name: serviceForm.name.trim(),
        code: serviceForm.code.trim() || undefined,
        sort_order: Number(serviceForm.sort_order) || 0,
        is_active: true,
      };
      if (editServiceId) await updateCourierService(editServiceId, payload);
      else await createCourierService(payload);
      setServiceModal(false);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan layanan");
    } finally {
      setSubmitting(false);
    }
  };

  const removeCourier = async (id: string) => {
    if (!confirm("Hapus ekspedisi ini beserta layanannya?")) return;
    try {
      const child = servicesFor(id);
      await Promise.all(child.map((s) => deleteCourierService(s.id)));
      await deleteCourier(id);
      await load();
    } catch {
      alert("Gagal menghapus ekspedisi");
    }
  };

  const seedDefaults = async () => {
    if (!confirm("Isi data contoh ekspedisi (JNE, J&T, SiCepat, dll.)? Data yang sudah ada tidak dihapus.")) {
      return;
    }
    setSeeding(true);
    try {
      const res = await fetch("/api/bisnis/couriers/seed", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal mengisi data");
      alert(
        `Selesai: ${data.couriersCreated} ekspedisi baru, ${data.servicesCreated} layanan baru ditambahkan.`,
      );
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal mengisi data contoh");
    } finally {
      setSeeding(false);
    }
  };

  const removeService = async (id: string) => {
    if (!confirm("Hapus layanan ini?")) return;
    try {
      await deleteCourierService(id);
      await load();
    } catch {
      alert("Gagal menghapus layanan");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Master Ekspedisi</h1>
            <p className="mt-1 text-sm text-slate-500">
              Kelola ekspedisi dan layanan pengiriman (Reguler, YES, Cargo, dll.)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void seedDefaults()}
              disabled={seeding}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Isi data contoh
            </button>
            <button
              type="button"
              onClick={openNewCourier}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> Tambah ekspedisi
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : couriers.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Truck className="mx-auto h-12 w-12 text-slate-200" />
            <h3 className="mt-4 text-lg font-semibold text-slate-700">Belum ada ekspedisi</h3>
            <p className="mt-1 text-sm text-slate-500">
              Buat collection di PocketBase (§11 POCKETBASE_POS_SETUP.md), lalu klik Isi data contoh
              atau tambah manual.
            </p>
            <button
              type="button"
              onClick={() => void seedDefaults()}
              disabled={seeding}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Isi data contoh (JNE, J&T, …)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {couriers.map((c) => {
              const open = expandedId === c.id;
              const svc = servicesFor(c.id);
              return (
                <div key={c.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : c.id)}
                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                    >
                      {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </button>
                    <CourierAvatar courier={c} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {svc.length} layanan · {c.is_active ? "Aktif" : "Nonaktif"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditCourier(c)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeCourier(c.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700">Layanan pengiriman</p>
                        <button
                          type="button"
                          onClick={() => openNewService(c.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> Tambah layanan
                        </button>
                      </div>
                      {svc.length === 0 ? (
                        <p className="text-sm text-slate-500">Belum ada layanan untuk {c.name}</p>
                      ) : (
                        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                          {svc.map((s) => (
                            <li key={s.id} className="flex items-center justify-between px-4 py-2.5">
                              <div>
                                <p className="text-sm font-medium text-slate-800">{s.name}</p>
                                <p className="text-xs text-slate-500">
                                  Urutan {s.sort_order ?? 0} · {s.is_active ? "Aktif" : "Nonaktif"}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditService(s)}
                                  className="rounded p-1 text-slate-400 hover:text-indigo-600"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeService(s.id)}
                                  className="rounded p-1 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {courierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">{editCourierId ? "Edit ekspedisi" : "Tambah ekspedisi"}</h2>
              <button type="button" onClick={() => setCourierModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void saveCourier(e)} className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-2 block text-sm font-medium">Ikon ekspedisi</label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Preview"
                      className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
                    />
                  ) : (
                    <CourierAvatar
                      courier={{
                        id: editCourierId ?? "new",
                        name: courierForm.name || "Ekspedisi",
                        code: courierForm.code,
                      }}
                      size="lg"
                    />
                  )}
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => logoRef.current?.click()}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {logoPreview ? "Ganti logo" : "Unggah logo"}
                    </button>
                    {logoPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setLogoFile(null);
                          setLogoPreview(null);
                          setRemoveLogo(true);
                        }}
                        className="block text-xs text-red-600 hover:text-red-700"
                      >
                        Hapus logo
                      </button>
                    )}
                    <p className="text-[11px] text-slate-500">
                      Kosongkan → ikon warna otomatis (JNE, J&T, dll.)
                    </p>
                  </div>
                </div>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleLogoChange(e)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Nama ekspedisi *</label>
                <input
                  required
                  value={courierForm.name}
                  onChange={(e) => setCourierForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="JNE"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Kode (opsional)</label>
                <input
                  value={courierForm.code}
                  onChange={(e) => setCourierForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="JNE"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : "Simpan"}
              </button>
            </form>
          </div>
        </div>
      )}

      {serviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">{editServiceId ? "Edit layanan" : "Tambah layanan"}</h2>
              <button type="button" onClick={() => setServiceModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void saveService(e)} className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Nama layanan *</label>
                <input
                  required
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Reguler"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Urutan tampil</label>
                <input
                  type="number"
                  min={0}
                  value={serviceForm.sort_order}
                  onChange={(e) =>
                    setServiceForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : "Simpan"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
