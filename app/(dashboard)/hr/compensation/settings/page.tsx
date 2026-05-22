"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { canAccess } from "@/lib/rbac";
import {
  fetchHrCompensationSettings,
  saveHrCompensationSettings,
  formatIdr,
  computeOvertimePaySimple,
  type HrCompensationSettings,
} from "@/lib/hr-compensation";
import { formatIntegerId, parseIntegerInput } from "@/lib/format-number";
import { ArrowLeft, Loader2, Moon, Save } from "lucide-react";
import Link from "next/link";

export default function HrCompensationSettingsPage() {
  const router = useRouter();
  const current = pb.authStore.model;
  const hasAccess = !!current && canAccess(current, "/hr/compensation/settings");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<HrCompensationSettings | null>(null);
  const [overtimeHourly, setOvertimeHourly] = useState("0");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      const s = await fetchHrCompensationSettings();
      setSettings(s);
      if (s) setOvertimeHourly(String(s.overtime_hourly_rate));
      setLoading(false);
    })();
  }, [hasAccess]);

  const previewOvertime = computeOvertimePaySimple(2, parseIntegerInput(overtimeHourly));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const res = await saveHrCompensationSettings({
      id: settings?.id,
      overtime_hourly_rate: parseIntegerInput(overtimeHourly),
      overtime_multiplier: 1,
      leave_daily_compensation_rate: 0,
    });
    setSaving(false);
    setMessage(res.message);
    if (res.success && res.settings) setSettings(res.settings);
  };

  if (!hasAccess) {
    return <div className="p-6 text-red-600">Hanya HR dan Owner.</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Tarif default lembur</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lembur = <strong>tarif per jam × jam</strong> (contoh 100.000 × 2 jam = 200.000). Cuti &amp; bonus extra
          diatur per karyawan di{" "}
          <Link href="/hr/employees" className="font-medium text-indigo-600 hover:underline">
            Data Karyawan
          </Link>
          .
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/80 p-4">
            <Moon className="h-5 w-5 shrink-0 text-indigo-600" />
            <p className="text-xs text-indigo-800">
              HR bisa ubah tarif saat menunjuk lembur atau menyetujui pengajuan staff. Angka di bawah hanya default.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Tarif lembur default per jam (Rp)</label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={overtimeHourly ? formatIntegerId(parseIntegerInput(overtimeHourly)) : ""}
              onChange={(e) => setOvertimeHourly(e.target.value.replace(/\D/g, ""))}
              placeholder="100000"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-2 text-sm text-slate-600">
              Contoh 2 jam: <strong>{formatIdr(previewOvertime)}</strong>
            </p>
          </div>

          {message ? (
            <p className={`text-sm ${message.includes("Gagal") ? "text-red-700" : "text-emerald-700"}`}>{message}</p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Cuti &amp; bonus (per karyawan)</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
          <li>
            <strong>Nominal cuti/hari</strong> + <strong>kuota/bulan</strong> → halaman detail karyawan
          </li>
          <li>Sisa kuota tidak dipakai → kredit gaji (kuota × tarif/hari)</li>
          <li>
            <strong>Bonus extra</strong> (mis. 500.000) → centang aktif di profil karyawan
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/hr/overtime" className="font-medium text-indigo-600 hover:underline">
          → Lembur HR
        </Link>
        <Link href="/hr/leave" className="font-medium text-indigo-600 hover:underline">
          → Cuti HR
        </Link>
      </div>
    </div>
  );
}
