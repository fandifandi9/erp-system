"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { isOwnerAccount } from "@/lib/auth-model";

type Props = {
  entityId: string;
  companyName: string;
  logoFilename?: string | null;
  updated?: string | null;
  onChanged: () => void;
};

function logoProxyUrl(entityId: string, updated?: string | null): string {
  const base = `/api/master-data/legal-entities/${encodeURIComponent(entityId)}/logo`;
  return updated ? `${base}?v=${encodeURIComponent(updated)}` : base;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

export function EntityLogoSection({ entityId, companyName, logoFilename, updated, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canManage = isOwnerAccount(pb.authStore.model);
  const logo = String(logoFilename ?? "").trim();
  const preview = logo ? logoProxyUrl(entityId, updated) : null;

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`/api/master-data/legal-entities/${encodeURIComponent(entityId)}/logo`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal mengunggah logo.");
      setMsg("Logo entitas berhasil diperbarui.");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengunggah logo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm(`Hapus logo untuk "${companyName}"? Slip gaji baru akan memakai inisial huruf sebagai fallback.`)) {
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/master-data/legal-entities/${encodeURIComponent(entityId)}/logo`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders(),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal menghapus logo.");
      setMsg("Logo dihapus.");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menghapus logo.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-800">Logo entitas</p>
        <p className="mt-1 text-xs text-slate-500">
          Hanya Owner yang dapat mengunggah atau mengubah logo. HR dapat melihat entitas di halaman ini (baca saja).
        </p>
        {preview ? (
          <img src={preview} alt="" className="mt-3 h-16 w-16 rounded-lg border border-slate-200 bg-white object-contain p-1" />
        ) : (
          <p className="mt-2 text-xs text-slate-500">Belum ada logo — minta Owner untuk mengunggah.</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-800">Logo entitas</p>
      <p className="mt-1 text-xs text-slate-500">
        Dipakai di slip gaji dan dokumen resmi entitas. Format PNG, JPEG, atau WebP — maks. 2 MB.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {preview ? (
          <img src={preview} alt="" className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-contain p-1" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
            <ImageIcon className="h-7 w-7" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {logo ? "Ganti logo" : "Unggah logo"}
          </button>
          {logo ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Hapus
            </button>
          ) : null}
        </div>
      </div>

      {msg ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
      {err ? <p className="mt-2 text-xs text-red-700">{err}</p> : null}
    </div>
  );
}
