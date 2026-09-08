"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2, Plus, Save } from "lucide-react";
import { canAccess } from "@/lib/rbac";
import { pb } from "@/lib/pocketbase";
import { HR_POLICY_CATEGORIES, hrPolicyCategoryLabel, type HrPolicyDto } from "@/lib/hr/hr-policy-types";
import type { EntityAttendancePolicyDto } from "@/lib/hr/entity-attendance-policy-types";

export default function HrPoliciesManagePage() {
  const user = pb.authStore.model;
  const hasAccess = !!user && canAccess(user, "/hr");

  const [items, setItems] = useState<HrPolicyDto[]>([]);
  const [attendancePolicies, setAttendancePolicies] = useState<EntityAttendancePolicyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAtt, setSavingAtt] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    category: "keterlambatan",
    content: "",
    publish: true,
  });
  const [attForm, setAttForm] = useState({
    late_grace_minutes: 0,
    late_rate_per_minute: 500,
    absence_rate_per_day: 100000,
    effective_from: new Date().toISOString().slice(0, 10),
    publish: true,
  });

  const load = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    try {
      const [policiesRes, attRes] = await Promise.all([
        fetch("/api/hr/policies", { credentials: "include" }),
        fetch("/api/hr/attendance-policies", { credentials: "include" }),
      ]);
      const data = (await policiesRes.json().catch(() => ({}))) as { ok?: boolean; items?: HrPolicyDto[]; error?: string };
      const attData = (await attRes.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: EntityAttendancePolicyDto[];
      };
      if (!policiesRes.ok || data.ok === false) throw new Error(data.error || "Gagal memuat.");
      setItems(data.items ?? []);
      setAttendancePolicies(attData.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }, [hasAccess]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAtt(true);
    setError("");
    try {
      const res = await fetch("/api/hr/attendance-policies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...attForm, late_enabled: true, absence_enabled: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error || "Gagal menyimpan kebijakan absensi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSavingAtt(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/hr/policies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error || "Gagal menyimpan.");
      setForm({ title: "", category: "keterlambatan", content: "", publish: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">Akses HR diperlukan.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <BookOpen className="h-7 w-7 text-indigo-600" />
            Kebijakan Kepegawaian
          </h1>
          <p className="mt-1 text-sm text-slate-500">Buat dan publikasikan kebijakan HR untuk staff.</p>
        </div>
        <Link href="/hr/work-calendar" className="text-sm text-indigo-600 hover:underline">
          Kalender kerja →
        </Link>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <form
        onSubmit={handleCreateAttendance}
        className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 shadow-sm"
      >
        <h2 className="font-semibold text-slate-800">Kebijakan Potongan Absensi (SSOT)</h2>
        <p className="text-xs text-slate-600">
          Nilai ini dipakai payroll calculation dan halaman staff. Publikasikan versi baru — payslip lama tetap
          memakai snapshot saat dihitung.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">Toleransi terlambat (menit)</span>
            <input
              type="number"
              min={0}
              value={attForm.late_grace_minutes}
              onChange={(e) => setAttForm((f) => ({ ...f, late_grace_minutes: Number(e.target.value) }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">Potongan terlambat (Rp/menit)</span>
            <input
              type="number"
              min={0}
              value={attForm.late_rate_per_minute}
              onChange={(e) => setAttForm((f) => ({ ...f, late_rate_per_minute: Number(e.target.value) }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">Potongan alpha (Rp/hari)</span>
            <input
              type="number"
              min={0}
              value={attForm.absence_rate_per_day}
              onChange={(e) => setAttForm((f) => ({ ...f, absence_rate_per_day: Number(e.target.value) }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">Berlaku sejak</span>
            <input
              type="date"
              value={attForm.effective_from}
              onChange={(e) => setAttForm((f) => ({ ...f, effective_from: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={attForm.publish}
            onChange={(e) => setAttForm((f) => ({ ...f, publish: e.target.checked }))}
          />
          Publikasikan (staff + payroll memakai versi ini)
        </label>
        <button
          type="submit"
          disabled={savingAtt}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {savingAtt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Kebijakan Absensi
        </button>
      </form>

      {attendancePolicies.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Riwayat Kebijakan Absensi</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {attendancePolicies.slice(0, 5).map((p) => (
              <li key={p.id}>
                {p.status} · {p.effective_from} · Rp {p.late_rate_per_minute.toLocaleString("id-ID")}/menit · Rp{" "}
                {p.absence_rate_per_day.toLocaleString("id-ID")}/hari
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form onSubmit={handleCreate} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Kebijakan Baru</h2>
        <input
          required
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Judul kebijakan"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
        />
        <select
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
        >
          {HR_POLICY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {hrPolicyCategoryLabel(c)}
            </option>
          ))}
        </select>
        <textarea
          required
          rows={6}
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          placeholder="Isi kebijakan (jelaskan aturan perusahaan, bukan rumus universal)"
          className="w-full resize-y rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.publish}
            onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))}
          />
          Publikasikan langsung (staff akan menerima notifikasi)
        </label>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Simpan
        </button>
      </form>

      <section>
        <h2 className="mb-3 font-semibold text-slate-800">Daftar Kebijakan</h2>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada kebijakan.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((p) => (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <span className="font-medium text-slate-900">{p.title}</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="text-slate-600">{hrPolicyCategoryLabel(p.category)}</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="capitalize text-slate-500">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
