"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, ImageIcon, Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { isOwnerOrHrAccount } from "@/lib/auth-model";
import { hasMasterDataCapability } from "@/lib/capabilities/master-data";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";

type EntityRow = {
  id: string;
  company_name: string;
  legal_name?: string;
  code?: string;
  entity_type?: string;
  is_active?: boolean;
  logo?: string;
  logo_url?: string;
};

export default function EntitasAdministratifReadOnlyPage() {
  const me = pb.authStore.model as Record<string, unknown> | null;
  const canView = isOwnerOrHrAccount(me) && hasMasterDataCapability(me, "master_data.entity.view");
  const isOwner = hasMasterDataCapability(me, "master_data.entity.manage");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EntityRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/master-data/legal-entities", {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as { ok?: boolean; data?: EntityRow[]; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat");
      setItems(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat entitas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
  }, [canView, load]);

  if (!canView) {
    return (
      <div className="p-6 text-red-600">
        Akses ditolak. Halaman ini untuk HR/Owner dengan scope entitas.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/pengaturan" className="text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-800">
            <Building2 className="h-6 w-6" />
            Entitas Administratif
          </h1>
          <p className="text-sm text-slate-500">
            Master data sistem — shared reference untuk HR, Accounting, Inventory, dan modul lain.
            {isOwner ? (
              <>
                {" "}
                <Link href="/pengaturan/perusahaan" className="text-indigo-600 underline">
                  Kelola di Perusahaan (Owner)
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Tidak ada entitas dalam scope Anda.</p>
      ) : (
        <ul className="divide-y rounded-2xl border border-slate-200 bg-white shadow-sm">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3">
              {e.logo_url ? (
                <img
                  src={e.logo_url}
                  alt=""
                  className="mt-0.5 h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
                />
              ) : (
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800">{e.company_name}</div>
                <div className="text-xs text-slate-500">
                  {[e.code, e.entity_type, e.legal_name !== e.company_name ? e.legal_name : null]
                    .filter(Boolean)
                    .join(" · ")}
                  {e.is_active === false ? " · Nonaktif" : ""}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {e.logo_url ? "Logo terpasang" : "Belum ada logo — minta Owner mengunggah di Kelola Entitas."}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
