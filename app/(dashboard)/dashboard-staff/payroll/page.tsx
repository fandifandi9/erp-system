"use client";

import { pb } from "@/lib/pocketbase";
import { useCallback, useEffect, useState } from "react";
import { fetchStaffPayrollSlips, type StaffPayrollSlip } from "@/lib/payroll";
import { canAccess } from "@/lib/rbac";
import { Banknote, Loader2 } from "lucide-react";

function money(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

const PERIOD_STATUS_LABEL: Record<string, string> = {
  approved: "Disetujui",
  paid: "Dibayar",
  closed: "Periode ditutup",
};

export default function StaffPayrollPage() {
  const [slips, setSlips] = useState<StaffPayrollSlip[]>([]);
  const [loading, setLoading] = useState(true);

  const uid = pb.authStore.model?.id ?? "";
  const current = pb.authStore.model;
  const hasAccess = !!current && canAccess(current, "/dashboard-staff");

  const load = useCallback(async () => {
    if (!uid) {
      setSlips([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchStaffPayrollSlips(uid);
      setSlips(list);
    } catch (e) {
      console.error(e);
      setSlips([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasAccess) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-slate-600">Anda tidak memiliki akses ke halaman ini.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Banknote className="h-7 w-7 text-emerald-600" />
          Slip gaji
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Hanya periode yang sudah disetujui atau dibayar oleh HR yang ditampilkan.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat…
        </div>
      ) : slips.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          Belum ada slip gaji yang dapat ditampilkan. Setelah HR menyetujui periode payroll, slip Anda akan
          muncul di sini.
        </div>
      ) : (
        <ul className="space-y-4">
          {slips.map((s) => (
            <li
              key={s.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">{s.period_key}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {s.period_start} — {s.period_end}
                  {s.pay_date ? ` · Tanggal bayar: ${s.pay_date}` : ""}
                </p>
                <p className="mt-1 text-xs font-medium text-emerald-700">
                  {PERIOD_STATUS_LABEL[s.period_status] ?? s.period_status}
                </p>
              </div>
              <div className="space-y-2 px-4 py-4 text-sm">
                <Row label="Gaji pokok" value={money(s.base_salary)} />
                <Row label="Lembur" value={money(s.overtime_amount)} />
                <Row
                  label="Bonus kehadiran"
                  value={money(s.attendance_bonus_amount)}
                  hint={
                    s.attendance_bonus_reason
                      ? s.attendance_bonus_eligible
                        ? s.attendance_bonus_reason
                        : `Tidak memenuhi syarat. ${s.attendance_bonus_reason}`
                      : s.attendance_bonus_eligible
                        ? undefined
                        : "Tidak memenuhi syarat"
                  }
                />
                <Row
                  label="Pencairan cuti"
                  value={money(s.leave_encashment_amount)}
                  hint={s.leave_encashment_reason}
                />
                <Row label="Potongan terlambat" value={money(s.late_deduction)} muted />
                <Row label="Potongan absensi" value={money(s.absence_deduction)} muted />
                <div className="my-2 border-t border-slate-100" />
                <Row label="Kotor" value={money(s.gross_amount)} strong />
                <Row label="Total potongan" value={money(s.total_deduction)} muted />
                <div className="flex items-center justify-between pt-1 text-base font-bold text-slate-900">
                  <span>THP</span>
                  <span className="text-emerald-700">Rp {money(s.net_amount)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  muted,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div>
      <div
        className={`flex justify-between gap-4 ${muted ? "text-slate-500" : strong ? "font-semibold text-slate-800" : "text-slate-700"}`}
      >
        <span>{label}</span>
        <span className="shrink-0 tabular-nums">Rp {value}</span>
      </div>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
