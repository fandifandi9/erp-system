"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Loader2, Save, Shield } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { normalizeAuthModel } from "@/lib/auth-model";

type CompanyRow = { id: string; name: string; code?: string };
type UserRow = {
  id: string;
  name?: string;
  email?: string;
  account_type?: string;
  role?: string;
  role_code?: string;
};

export default function AksesEntitasPage() {
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [accessByUserId, setAccessByUserId] = useState<Record<string, string[]>>({});
  const [draft, setDraft] = useState<Record<string, string[]>>({});

  const me = pb.authStore.model as Record<string, unknown> | null;
  const canManage =
    normalizeAuthModel(me ?? undefined).accountType === "owner" ||
    normalizeAuthModel(me ?? undefined).roleCode === "hr";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tenant/users/company-access", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data");
      setUsers(data.users ?? []);
      setCompanies(data.companies ?? []);
      setAccessByUserId(data.accessByUserId ?? {});
      setDraft(data.accessByUserId ?? {});
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

  const toggle = (userId: string, companyId: string) => {
    setDraft((prev) => {
      const cur = new Set(prev[userId] ?? accessByUserId[userId] ?? []);
      if (cur.has(companyId)) {
        if (cur.size <= 1) return prev;
        cur.delete(companyId);
      } else {
        cur.add(companyId);
      }
      return { ...prev, [userId]: [...cur] };
    });
  };

  const saveUser = async (userId: string) => {
    const companyIds = draft[userId] ?? accessByUserId[userId] ?? [];
    if (companyIds.length === 0) {
      alert("Minimal satu entitas harus dipilih");
      return;
    }
    setSavingUserId(userId);
    setError(null);
    try {
      const res = await fetch("/api/tenant/users/company-access", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, companyIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      setAccessByUserId((prev) => ({ ...prev, [userId]: companyIds }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSavingUserId(null);
    }
  };

  const isOwnerUser = (u: UserRow) =>
    String(u.account_type || "").toLowerCase() === "owner" ||
    String(u.role || "").toLowerCase() === "owner";

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Hanya owner atau HR yang dapat mengatur akses entitas pengguna.
        </p>
        <Link href="/pengaturan" className="text-sm text-indigo-600 hover:underline">
          ← Kembali ke Pengaturan
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/pengaturan"
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Akses Entitas</h1>
            <p className="text-sm text-slate-500">
              Tentukan PT/CV mana yang boleh diakses setiap pengguna ERP
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : companies.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada entitas aktif. Tambahkan di Pengaturan → Perusahaan.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Pengguna</th>
                  {companies.map((c) => (
                    <th key={c.id} className="max-w-[140px] px-3 py-3 text-center text-xs font-semibold text-slate-600">
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="line-clamp-2 leading-snug" title={c.name}>
                          {c.name || c.code || "—"}
                        </span>
                        {c.code ? (
                          <span className="text-[10px] font-normal text-slate-400">{c.code}</span>
                        ) : null}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => {
                  const owner = isOwnerUser(u);
                  const selected = draft[u.id] ?? accessByUserId[u.id] ?? [];
                  const dirty =
                    JSON.stringify([...(draft[u.id] ?? accessByUserId[u.id] ?? [])].sort()) !==
                    JSON.stringify([...(accessByUserId[u.id] ?? [])].sort());

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{u.name || u.email}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                        {owner ? (
                          <span className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                            Owner — semua entitas
                          </span>
                        ) : null}
                      </td>
                      {companies.map((c) => (
                        <td key={c.id} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={owner || selected.includes(c.id)}
                            disabled={owner}
                            onChange={() => toggle(u.id, c.id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        {!owner && dirty ? (
                          <button
                            type="button"
                            onClick={() => void saveUser(u.id)}
                            disabled={savingUserId === u.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {savingUserId === u.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            Simpan
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Owner otomatis memiliki akses ke semua entitas. Pengguna lain hanya melihat transaksi & laporan entitas yang
        dicentang. Konteks kerja aktif disesuaikan saat akses diubah.
      </p>
    </div>
  );
}
