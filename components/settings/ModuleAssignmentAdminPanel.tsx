"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
} from "lucide-react";
import { isOwnerAccount } from "@/lib/auth-model";
import type { ModuleUiCatalog } from "@/lib/access/capability-ui-catalog";
import { pb } from "@/lib/pocketbase";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

type AssignmentRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  moduleId: string;
  moduleLabel: string;
  accessMode: "full" | "custom";
  entityScopeMode: "all" | "selected";
  deskEnabled: boolean;
  isActive: boolean;
  customPermissions: string[];
  entityCompanyIds: string[];
  entityCompanyNames: string[];
  capabilityCount: number;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  roleCode: string;
  companyIds: string[];
  companies: { id: string; name: string }[];
};

type FormState = {
  userId: string;
  moduleId: string;
  accessMode: "full" | "custom";
  entityScopeMode: "all" | "selected";
  deskEnabled: boolean;
  isActive: boolean;
  customPermissions: string[];
  entityCompanyIds: string[];
};

const EMPTY_FORM: FormState = {
  userId: "",
  moduleId: "hr",
  accessMode: "full",
  entityScopeMode: "selected",
  deskEnabled: true,
  isActive: true,
  customPermissions: [],
  entityCompanyIds: [],
};

type PreviewData = {
  capabilityCount: number;
  capabilityKeys?: string[];
  derivedWebPaths?: string[];
  entityCompanyIds: string[];
  entityCompanyNames: string[];
  workingCompanyId?: string | null;
  workingCompanyName?: string | null;
};

export function ModuleAssignmentAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AssignmentRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [catalog, setCatalog] = useState<ModuleUiCatalog[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [userSearch, setUserSearch] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const me = pb.authStore.model as Record<string, unknown> | null;
  const canManage = isOwnerAccount(me);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access/admin/module-assignments", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data");
      setItems(data.items ?? []);
      setUsers(data.users ?? []);
      setCatalog(data.catalog ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
    else setLoading(false);
  }, [canManage, load]);

  const moduleCatalog = useMemo(
    () => catalog.find((c) => c.id === form.moduleId),
    [catalog, form.moduleId],
  );

  const selectedUser = useMemo(
    () => users.find((u) => u.id === form.userId) ?? null,
    [users, form.userId],
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleCode.toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setUserSearch("");
    setPreview(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: AssignmentRow) => {
    setEditingId(row.id);
    setForm({
      userId: row.userId,
      moduleId: row.moduleId,
      accessMode: row.accessMode,
      entityScopeMode: row.entityScopeMode,
      deskEnabled: row.deskEnabled,
      isActive: row.isActive,
      customPermissions: [...row.customPermissions],
      entityCompanyIds: [...row.entityCompanyIds],
    });
    setUserSearch("");
    setPreview({
      capabilityCount: row.capabilityCount,
      entityCompanyIds: row.entityCompanyIds,
      entityCompanyNames: row.entityCompanyNames,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPreview(null);
  };

  useEffect(() => {
    if (!drawerOpen || !form.userId || !form.moduleId) {
      setPreview(null);
      return;
    }
    if (form.accessMode === "custom" && form.customPermissions.length === 0) {
      setPreview(null);
      return;
    }
    if (form.entityScopeMode === "selected" && form.entityCompanyIds.length === 0) {
      setPreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/access/admin/module-assignments/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (res.ok) setPreview(data.data);
      } catch {
        /* ignore preview errors */
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [drawerOpen, form]);

  const toggleCapability = (key: string) => {
    setForm((prev) => {
      const set = new Set(prev.customPermissions);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, customPermissions: [...set] };
    });
  };

  const toggleEntity = (companyId: string) => {
    setForm((prev) => {
      const set = new Set(prev.entityCompanyIds);
      if (set.has(companyId)) set.delete(companyId);
      else set.add(companyId);
      return { ...prev, entityCompanyIds: [...set] };
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/access/admin/module-assignments/${editingId}`
        : "/api/access/admin/module-assignments";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      closeDrawer();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: AssignmentRow) => {
    setActionId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/access/admin/module-assignments/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.userId,
          moduleId: row.moduleId,
          accessMode: row.accessMode,
          entityScopeMode: row.entityScopeMode,
          deskEnabled: row.deskEnabled,
          isActive: !row.isActive,
          customPermissions: row.customPermissions,
          entityCompanyIds: row.entityCompanyIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memperbarui status");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memperbarui");
    } finally {
      setActionId(null);
    }
  };

  const remove = async (row: AssignmentRow) => {
    if (!window.confirm(`Hapus akses modul ${row.moduleLabel} untuk ${row.userName}?`)) return;
    setActionId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/access/admin/module-assignments/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setActionId(null);
    }
  };

  const scopeLabel = (row: AssignmentRow) => {
    if (row.entityScopeMode === "all") return "Semua entitas (membership)";
    if (row.entityCompanyNames.length) return row.entityCompanyNames.join(", ");
    return "—";
  };

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Hanya Owner yang dapat mengelola akses modul.
        </p>
        <Link href="/pengaturan" className="text-sm text-indigo-600 hover:underline">
          ← Kembali ke Pengaturan
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/pengaturan"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Akses Modul</h1>
              <p className="text-sm text-slate-500">
                Tetapkan modul, tingkat akses, dan scope entitas untuk setiap pengguna
              </p>
            </div>
          </div>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" />
          Tambah Akses Modul
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Pengguna</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Modul</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Akses</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Scope Entity</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Meja Kerja</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      Belum ada penugasan modul. Klik &quot;Tambah Akses Modul&quot; untuk memulai.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{row.userName}</p>
                        <p className="text-xs text-slate-500">{row.userEmail}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{row.moduleLabel}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-700">
                          {row.accessMode}
                        </span>
                      </td>
                      <td className="max-w-[200px] px-4 py-3 text-slate-600">
                        <span className="line-clamp-2" title={scopeLabel(row)}>
                          {scopeLabel(row)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            row.deskEnabled
                              ? "text-xs font-medium text-emerald-700"
                              : "text-xs text-slate-400"
                          }
                        >
                          {row.deskEnabled ? "ON" : "OFF"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            row.isActive
                              ? "rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                              : "rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                          }
                        >
                          {row.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleActive(row)}
                            disabled={actionId === row.id}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-amber-600 disabled:opacity-50"
                            title={row.isActive ? "Nonaktifkan" : "Aktifkan"}
                          >
                            {actionId === row.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(row)}
                            disabled={actionId === row.id}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Perubahan akses modul berlaku setelah pengguna logout dan login kembali. Meja Kerja hanya
        mengatur tampilan, bukan izin akses.
      </p>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingId ? "Edit Akses Modul" : "Tambah Akses Modul"}
        description="Siapa → Modul apa → Akses seberapa luas → Entity mana → Tampil di Meja Kerja"
        size="lg"
        footer={
          <DrawerFooterActions
            onCancel={closeDrawer}
            onSave={() => void save()}
            cancelLabel="Batal"
            saveLabel={editingId ? "Simpan Perubahan" : "Buat Penugasan"}
            loading={saving}
          />
        }
      >
        <div className="space-y-5">
          {/* User picker */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-erp-text">Pengguna</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Cari nama atau email..."
                className="w-full rounded-lg border border-erp-border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-erp-border">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      userId: u.id,
                      entityCompanyIds: prev.entityCompanyIds.filter((id) => u.companyIds.includes(id)),
                    }));
                  }}
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-erp-surface-muted ${
                    form.userId === u.id ? "bg-indigo-50" : ""
                  }`}
                >
                  <span className="font-medium text-erp-text">{u.name}</span>
                  <span className="text-xs text-erp-text-muted">
                    {u.email} · {u.roleCode}
                    {u.companies.length ? ` · ${u.companies.map((c) => c.name).join(", ")}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Module */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-erp-text">Modul</label>
            <select
              value={form.moduleId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  moduleId: e.target.value,
                  customPermissions: [],
                }))
              }
              className="w-full rounded-lg border border-erp-border px-3 py-2 text-sm"
            >
              {catalog.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Access mode */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-erp-text">Mode Akses</label>
            <div className="space-y-2">
              <label className="flex cursor-pointer gap-2 rounded-lg border border-erp-border p-3 hover:bg-erp-surface-muted">
                <input
                  type="radio"
                  name="accessMode"
                  checked={form.accessMode === "full"}
                  onChange={() => setForm((prev) => ({ ...prev, accessMode: "full", customPermissions: [] }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-erp-text">FULL</p>
                  <p className="text-xs text-erp-text-muted">
                    Semua akses yang tersedia untuk modul ini, kecuali akses administratif/Owner-only.
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer gap-2 rounded-lg border border-erp-border p-3 hover:bg-erp-surface-muted">
                <input
                  type="radio"
                  name="accessMode"
                  checked={form.accessMode === "custom"}
                  onChange={() => setForm((prev) => ({ ...prev, accessMode: "custom" }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-erp-text">CUSTOM</p>
                  <p className="text-xs text-erp-text-muted">Pilih akses tertentu yang diperlukan.</p>
                </div>
              </label>
            </div>
          </div>

          {form.accessMode === "full" ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Mode FULL menggunakan seluruh capability modul dari registry, tanpa akses Owner-only.
            </p>
          ) : moduleCatalog ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-erp-text">Akses Kustom</label>
              <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border border-erp-border p-3">
                {moduleCatalog.groups.map((g) => (
                  <div key={g.id}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {g.label}
                    </p>
                    <div className="space-y-1">
                      {g.options.map((opt) => (
                        <label key={opt.key} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.customPermissions.includes(opt.key)}
                            onChange={() => toggleCapability(opt.key)}
                            className="rounded border-slate-300 text-indigo-600"
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Entity scope */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-erp-text">Scope Entitas</label>
            <div className="space-y-2">
              <label className="flex cursor-pointer gap-2 rounded-lg border border-erp-border p-3 hover:bg-erp-surface-muted">
                <input
                  type="radio"
                  name="entityScope"
                  checked={form.entityScopeMode === "all"}
                  onChange={() => setForm((prev) => ({ ...prev, entityScopeMode: "all", entityCompanyIds: [] }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-erp-text">ALL</p>
                  <p className="text-xs text-erp-text-muted">
                    Akses ke seluruh entity yang menjadi membership pengguna.
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer gap-2 rounded-lg border border-erp-border p-3 hover:bg-erp-surface-muted">
                <input
                  type="radio"
                  name="entityScope"
                  checked={form.entityScopeMode === "selected"}
                  onChange={() => setForm((prev) => ({ ...prev, entityScopeMode: "selected" }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-erp-text">SELECTED</p>
                  <p className="text-xs text-erp-text-muted">Pilih entity tertentu.</p>
                </div>
              </label>
            </div>
            {form.entityScopeMode === "selected" ? (
              <div className="mt-2 space-y-1 rounded-lg border border-erp-border p-3">
                {!selectedUser ? (
                  <p className="text-xs text-amber-700">Pilih pengguna terlebih dahulu.</p>
                ) : selectedUser.companies.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    Pengguna belum memiliki membership entitas. Atur di Akses Entitas.
                  </p>
                ) : (
                  selectedUser.companies.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.entityCompanyIds.includes(c.id)}
                        onChange={() => toggleEntity(c.id)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>{c.name}</span>
                    </label>
                  ))
                )}
              </div>
            ) : null}
          </div>

          {/* Desk toggle */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-erp-border p-3">
            <input
              type="checkbox"
              checked={form.deskEnabled}
              onChange={(e) => setForm((prev) => ({ ...prev, deskEnabled: e.target.checked }))}
              className="mt-0.5 rounded border-slate-300 text-indigo-600"
            />
            <div>
              <p className="text-sm font-medium text-erp-text">Tambahkan ke Meja Kerja</p>
              <p className="text-xs text-erp-text-muted">
                Menentukan apakah modul ditampilkan di Meja Kerja. Ini tidak memberikan permission
                tambahan.
              </p>
            </div>
          </label>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-erp-text">Status</label>
            <select
              value={form.isActive ? "active" : "inactive"}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.value === "active" }))}
              className="w-full rounded-lg border border-erp-border px-3 py-2 text-sm"
            >
              <option value="active">Aktif</option>
              <option value="inactive">Tidak Aktif</option>
            </select>
          </div>

          {/* Preview */}
          {(preview || previewLoading) && selectedUser ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Pratinjau Akses Efektif
              </p>
              {previewLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              ) : preview ? (
                <dl className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">User:</dt>
                    <dd className="font-medium text-slate-800">{selectedUser.name}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Modul:</dt>
                    <dd className="font-medium text-slate-800">
                      {moduleCatalog?.label ?? form.moduleId} — {form.accessMode.toUpperCase()}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Entity:</dt>
                    <dd className="text-slate-800">
                      {preview.entityCompanyNames.length
                        ? preview.entityCompanyNames.join(", ")
                        : form.entityScopeMode === "all"
                          ? "Semua (sesuai membership)"
                          : "—"}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Working:</dt>
                    <dd className="text-slate-800">
                      {preview.workingCompanyName || preview.workingCompanyId || "—"}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Meja Kerja:</dt>
                    <dd className="text-slate-800">{form.deskEnabled ? "Aktif" : "Nonaktif"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Capabilities:</dt>
                    <dd className="min-w-0 text-slate-800">
                      <span className="font-medium">{preview.capabilityCount} tersedia</span>
                      {preview.capabilityKeys && preview.capabilityKeys.length > 0 ? (
                        <ul className="mt-1 max-h-28 list-inside list-disc overflow-y-auto text-xs text-slate-600">
                          {preview.capabilityKeys.map((k) => (
                            <li key={k}>{k}</li>
                          ))}
                        </ul>
                      ) : null}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Web paths:</dt>
                    <dd className="min-w-0 text-slate-800">
                      {preview.derivedWebPaths && preview.derivedWebPaths.length > 0 ? (
                        <ul className="max-h-28 list-inside list-disc overflow-y-auto text-xs text-slate-600">
                          {preview.derivedWebPaths.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
