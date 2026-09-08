"use client";

import { useEffect, useState } from "react";
import { fetchStaffBenefitSummary, formatIdr, type StaffBenefitSummary } from "@/lib/employee-benefits";
import { Calendar, Gift, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
export function StaffBenefitCard({ userId }: { userId: string }) {
  const [data, setData] = useState<StaffBenefitSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setData(null);
      setLoading(false);
      return;
    }
    let ok = true;
    setLoading(true);
    void (async () => {
      const s = await fetchStaffBenefitSummary(userId);
      if (ok) {
        setData(s);
        setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat info cuti &amp; bonus…
      </div>
    );
  }

  if (!data) return null;

  const eb = data.extraBonus;
  const bonusStatusClass =
    eb.status === "on_track"
      ? "border-emerald-300 bg-emerald-50"
      : eb.status === "at_risk"
        ? "border-amber-300 bg-amber-50"
        : "border-slate-200 bg-slate-50";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
          <div className="flex items-start gap-2">
            <Calendar className="h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Cuti — {data.leaveQuotaMonthLabel}</p>
              <p className="mt-1 text-xs text-emerald-800">
                Kuota: <strong>{data.leaveQuotaUsed}</strong> / {data.leaveQuotaMax} kali · sisa{" "}
                <strong>{data.leaveQuotaRemaining}</strong>
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                Nominal: <strong>{formatIdr(data.leaveDailyRate)}</strong>/hari
              </p>
              {data.leaveQuotaRemaining > 0 && data.leaveDailyRate > 0 ? (
                <p className="mt-2 text-xs font-medium text-emerald-900">
                  Sisa kuota tidak dipakai → estimasi kredit gaji +{formatIdr(data.leaveQuotaCreditEstimate)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`rounded-xl border p-4 ${bonusStatusClass}`}>
          <div className="flex items-start gap-2">
            <Gift className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Bonus extra — {eb.snapshot?.monthLabel}</p>
              {eb.enabled && eb.targetAmount > 0 ? (
                <>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    Estimasi: {formatIdr(eb.estimatedAmount)}
                  </p>
                  <p className="text-xs text-slate-600">
                    Target bulan ini: {formatIdr(eb.targetAmount)} ·{" "}
                    <span
                      className={
                        eb.status === "on_track" ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"
                      }
                    >
                      {eb.statusLabel}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-600">Belum diaktifkan HR untuk akun Anda.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {eb.enabled && eb.targetAmount > 0 ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-sm text-slate-800">
          <p className="font-semibold text-indigo-900">Regulasi bonus extra</p>
          <p className="mt-1 text-xs text-indigo-800">
            Dihitung otomatis dari <strong>absensi</strong> di akhir bulan (saat gajian). Syarat utama:{" "}
            <strong>full masuk tanpa alpha</strong> (tidak ada hari kerja tanpa kehadiran sah).
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-700">
            {eb.regulationBullets.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-indigo-500">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {eb.snapshot ? (
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-white/80 bg-white/90 p-3 text-xs sm:grid-cols-4">
              <Stat label="Hari kerja wajib*" value={String(eb.snapshot.requiredWorkDays)} />
              <Stat label="Hadir (log)" value={String(eb.snapshot.presentDays)} />
              <Stat label="Cuti disetujui" value={String(eb.snapshot.approvedLeaveDays)} />
              <Stat
                label="Alpha"
                value={String(eb.snapshot.alphaDays)}
                highlight={eb.snapshot.alphaDays > 0 ? "bad" : "good"}
              />
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-slate-500">
            *Hari kerja wajib mengikuti jadwal global &amp; libur kantor (lihat HR → Jadwal &amp; libur) sampai tanggal penilaian{" "}
            {eb.snapshot?.evaluatedThrough ?? "akhir bulan"}. Cuti/luar kantor yang disetujui dapat dihitung hadir sesuai kebijakan.
          </p>

          <div
            className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              eb.onTrack ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
            }`}
          >
            {eb.onTrack ? (
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{eb.reason}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "bad";
}) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p
        className={`text-base font-bold tabular-nums ${
          highlight === "bad" ? "text-red-700" : highlight === "good" ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
