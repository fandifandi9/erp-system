"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, Loader2 } from "lucide-react";
import { hrPolicyCategoryLabel, type HrPolicyDto } from "@/lib/hr/hr-policy-types";
import type { StaffAttendancePolicyView } from "@/lib/hr/entity-attendance-policy-types";

export default function StaffPoliciesPage() {
  const [items, setItems] = useState<HrPolicyDto[]>([]);
  const [attendancePolicy, setAttendancePolicy] = useState<StaffAttendancePolicyView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [policiesRes, attRes] = await Promise.all([
        fetch("/api/hr/policies/published", { credentials: "include" }),
        fetch("/api/hr/attendance-policies/effective", { credentials: "include" }),
      ]);
      const policiesData = (await policiesRes.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: HrPolicyDto[];
        error?: string;
      };
      const attData = (await attRes.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: StaffAttendancePolicyView | null;
        error?: string;
      };
      if (!policiesRes.ok || policiesData.ok === false) {
        throw new Error(policiesData.error || "Gagal memuat kebijakan.");
      }
      setItems(policiesData.items ?? []);
      setAttendancePolicy(attData.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat kebijakan.");
      setItems([]);
      setAttendancePolicy(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = items.reduce<Record<string, HrPolicyDto[]>>((acc, p) => {
    const key = p.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link
          href="/dashboard-staff"
          className="mb-3 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Kembali ke dasbor
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <BookOpen className="h-7 w-7 text-indigo-600" />
          Aturan & Informasi HR
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Kebijakan kepegawaian yang berlaku untuk entitas administratif Anda. Potongan gaji dihitung dari
          konfigurasi HR yang sama dengan payroll.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : (
        <>
          {attendancePolicy ? (
            <section className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Kebijakan Potongan Absensi</h2>
                <p className="mt-1 text-xs text-slate-600">
                  Aturan ini mengikuti kebijakan HR yang berlaku untuk entitas Anda
                  {attendancePolicy.company_name ? `: ${attendancePolicy.company_name}` : ""}.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Berlaku sejak {formatDateId(attendancePolicy.effective_from)}
                  {attendancePolicy.effective_until
                    ? ` hingga ${formatDateId(attendancePolicy.effective_until)}`
                    : ""}
                  {attendancePolicy.updated
                    ? ` · Diperbarui ${formatDateId(attendancePolicy.updated.slice(0, 10))}`
                    : ""}
                </p>
              </div>

              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-800">Keterlambatan</h3>
                {attendancePolicy.late_enabled ? (
                  <>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
                      <li>Toleransi keterlambatan: {attendancePolicy.late_grace_minutes} menit</li>
                      <li>
                        Tarif potongan: Rp {attendancePolicy.late_rate_per_minute.toLocaleString("id-ID")}/menit
                      </li>
                    </ul>
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Contoh: {attendancePolicy.late_example}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">Potongan keterlambatan tidak aktif.</p>
                )}
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-800">Ketidakhadiran</h3>
                {attendancePolicy.absence_enabled ? (
                  <>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
                      <li>
                        Alpha (tanpa keterangan): Rp{" "}
                        {attendancePolicy.absence_rate_per_day.toLocaleString("id-ID")}/hari
                      </li>
                      <li>{attendancePolicy.approved_leave_note}</li>
                      <li>{attendancePolicy.sick_leave_note}</li>
                      <li>{attendancePolicy.official_business_note}</li>
                    </ul>
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Contoh: {attendancePolicy.absence_example}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">Potongan ketidakhadiran tidak aktif.</p>
                )}
              </article>
            </section>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Belum ada kebijakan potongan absensi terstruktur untuk entitas Anda. Hubungi HR.
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              Belum ada kebijakan HR naratif yang dipublikasikan untuk entitas Anda.
            </div>
          ) : (
            Object.entries(grouped).map(([category, policies]) => (
              <section key={category} className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  {hrPolicyCategoryLabel(category)}
                </h2>
                {policies.map((p) => (
                  <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
                    {p.effective_from ? (
                      <p className="mt-1 text-xs text-slate-500">Berlaku sejak {formatDateId(p.effective_from)}</p>
                    ) : null}
                    <div className="prose prose-sm mt-4 max-w-none whitespace-pre-wrap text-slate-700">
                      {p.content}
                    </div>
                    {p.example_note ? (
                      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        {p.example_note}
                      </p>
                    ) : null}
                  </article>
                ))}
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

function formatDateId(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
