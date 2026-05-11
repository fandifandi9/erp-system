"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import {
  submitLeaveRequest,
  getMonthlyBookingUsage,
  getLeaveCalendarMonthSnapshot,
  getMaxBookingsPerMonth,
  resolveProfileDivisionKey,
  inclusiveEndDateForDuration,
  expandInclusiveDateRange,
  todayYmdLocal,
  type MonthlyBookingInfo,
} from "@/lib/leave";
import { LeaveBookingCalendar } from "@/components/LeaveBookingCalendar";
import { checkProfileComplete } from "@/lib/profile";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertTriangle, Loader2, AlertCircle as AlertIcon, Info, Users, TrendingUp } from "lucide-react";

const HISTORY_TAB = "/dashboard-staff/leave?tab=history";

export function StaffLeaveBookingPanel({ omitPageHeader = false }: { omitPageHeader?: boolean }) {
  const router = useRouter();
  const currentUser = pb.authStore.model;
  const currentUserId = currentUser?.id ?? "";

  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileServerUnreachable, setProfileServerUnreachable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userDivision, setUserDivision] = useState("");
  const [monthlyBooking, setMonthlyBooking] = useState<MonthlyBookingInfo | null>(null);

  /** Batas per akun (dari profil HR); fallback = default sistem jika data belum terbaca. */
  const monthlyQuotaMax = monthlyBooking?.max ?? getMaxBookingsPerMonth();

  /** Satu ketukan di kalender = satu pengajuan untuk tepat satu tanggal (selaras validasi server). */
  const DAYS_PER_CALENDAR_BOOKING = 1;

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [calendarSnapshot, setCalendarSnapshot] = useState<{
    maxPeoplePerDay: number;
    divisionFullDates: string[];
    divisionPartialDates: string[];
    myBookedDates: string[];
    myPendingDates: string[];
  } | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calendarBooking, setCalendarBooking] = useState(false);

  const loadCalendarSnapshot = useCallback(async () => {
    if (!currentUserId || !userDivision || profileIncomplete || checking) return;
    setCalLoading(true);
    try {
      const snap = await getLeaveCalendarMonthSnapshot(
        currentUserId,
        userDivision,
        viewMonth.getFullYear(),
        viewMonth.getMonth()
      );
      setCalendarSnapshot(snap);
    } finally {
      setCalLoading(false);
    }
  }, [currentUserId, userDivision, profileIncomplete, checking, viewMonth]);

  const runProfileGate = useCallback(async () => {
    if (!currentUserId) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const profileCheck = await checkProfileComplete(currentUserId);
    setProfileServerUnreachable(!!profileCheck.serverUnreachable);

    if (!profileCheck.isComplete) {
      setProfileIncomplete(true);
      setProfileMessage(profileCheck.message);
      setUserDivision("");
      setMonthlyBooking(null);
    } else {
      setProfileIncomplete(false);
      setProfileMessage("");
      try {
        const profile = await pb.collection("profiles").getFirstListItem(
          `user="${currentUserId}"`,
          { requestKey: null }
        );
        setUserDivision(
          resolveProfileDivisionKey(
            profile as { division?: string; department?: string }
          )
        );
        const usage = await getMonthlyBookingUsage(currentUserId);
        setMonthlyBooking(usage);
      } catch (err) {
        console.error("Failed to get division / usage:", err);
      }
    }
    setChecking(false);
  }, [currentUserId]);

  useEffect(() => {
    void runProfileGate();
  }, [runProfileGate]);

  const divisionFullDatesSet = useMemo(
    () => new Set(calendarSnapshot?.divisionFullDates ?? []),
    [calendarSnapshot]
  );

  const divisionPartialDatesSet = useMemo(
    () => new Set(calendarSnapshot?.divisionPartialDates ?? []),
    [calendarSnapshot]
  );

  const myBookedDatesSet = useMemo(
    () => new Set(calendarSnapshot?.myBookedDates ?? []),
    [calendarSnapshot]
  );

  const myPendingDatesSet = useMemo(
    () => new Set(calendarSnapshot?.myPendingDates ?? []),
    [calendarSnapshot]
  );

  const maxPeopleDisplay = calendarSnapshot?.maxPeoplePerDay ?? 2;

  const previewDatesSet = useMemo(() => new Set<string>(), []);

  useEffect(() => {
    void loadCalendarSnapshot();
  }, [loadCalendarSnapshot]);

  const shiftCalendarMonth = useCallback((delta: number) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const isMonthlyLimitReached =
    monthlyBooking !== null && monthlyBooking.used >= monthlyBooking.max;

  const bookingFlow = async (
    startDate: string,
    endDate: string,
    setBusy: (b: boolean) => void
  ): Promise<boolean> => {
    if (!currentUserId) {
      setError("Silakan login terlebih dahulu");
      return false;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await submitLeaveRequest({
        userId: currentUserId,
        start_date: startDate,
        end_date: endDate,
      });
      if (result.success) {
        setSuccess(result.message);

        const usage = await getMonthlyBookingUsage(currentUserId);
        setMonthlyBooking(usage);
        await loadCalendarSnapshot();

        setTimeout(() => {
          router.replace(HISTORY_TAB);
        }, 2000);
        return true;
      }
      setError(result.message);
      return false;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan cuti");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCalendarQuickBook = async (ymd: string) => {
    if (!currentUserId) {
      setError("Silakan login terlebih dahulu.");
      return;
    }
    if (isMonthlyLimitReached) {
      setError(
        `Kuota booking bulan ini sudah habis (${monthlyQuotaMax}× per bulan kalender). Batalkan salah satu booking yang belum mulai atau tunggu bulan depan.`
      );
      return;
    }

    const dur = DAYS_PER_CALENDAR_BOOKING;

    const todayStr = todayYmdLocal();
    if (ymd < todayStr) return;

    const endDate = inclusiveEndDateForDuration(ymd, dur);
    const span = expandInclusiveDateRange(ymd, endDate);

    for (const d of span) {
      if (divisionFullDatesSet.has(d)) {
        setError(
          `Tanggal ${d} bentrok dengan kuota divisi yang sudah penuh. Pilih tanggal lain.`
        );
        return;
      }
      if (myBookedDatesSet.has(d) || myPendingDatesSet.has(d)) {
        setError(
          `Tanggal ${d} overlap dengan pengajuan atau cuti Anda. Pilih rentang lain.`
        );
        return;
      }
    }

    await bookingFlow(ymd, endDate, setCalendarBooking);
  };

  if (checking) {
    return (
      <div className="flex min-h-[400px] items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (profileIncomplete) {
    const pbUrl =
      typeof process !== "undefined" && process.env.NEXT_PUBLIC_POCKETBASE_URL
        ? process.env.NEXT_PUBLIC_POCKETBASE_URL
        : "(lihat .env.local — NEXT_PUBLIC_POCKETBASE_URL)";

    return (
      <div className={`space-y-6 ${omitPageHeader ? "" : "mx-auto max-w-3xl"}`}>
        {!omitPageHeader && (
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Booking Cuti</h1>
            <p className="text-slate-500 mt-1">Pengajuan cuti — menunggu persetujuan HR</p>
          </div>
        )}

        {profileServerUnreachable ? (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8">
            <AlertIcon className="w-16 h-16 text-amber-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-amber-900 text-center mb-2">
              Tidak terhubung ke PocketBase
            </h2>
            <p className="text-amber-900/90 text-center mb-4">{profileMessage}</p>
            <div className="bg-white rounded-xl p-4 text-left text-sm text-slate-700 space-y-2">
              <p>
                <strong>URL server data:</strong>{" "}
                <code className="text-xs bg-slate-100 px-1 rounded break-all">{pbUrl}</code>
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>Pastikan server PocketBase di alamat itu menyala dan port benar (biasanya 8091).</li>
                <li>Periksa firewall / VPN; coba buka URL PocketBase di browser (halaman admin).</li>
                <li>
                  <code className="text-xs">ERR_NETWORK_IO_SUSPENDED</code> sering muncul jika tab lama di-background —
                  refresh tab atau fokuskan jendela ini lalu coba lagi.
                </li>
              </ul>
            </div>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void runProfileGate()}
                className="px-6 py-3 rounded-xl font-semibold bg-amber-600 text-white hover:bg-amber-700"
              >
                Coba lagi
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 text-center">
            <AlertIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-800 mb-2">Data HR Belum Lengkap</h2>
            <p className="text-red-700 mb-4">{profileMessage}</p>
            <div className="bg-white rounded-xl p-4 text-left">
              <p className="font-semibold text-slate-800 mb-2">Silakan hubungi HR untuk melengkapi:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
                <li>Jabatan</li>
                <li>Departemen</li>
                <li>Divisi</li>
                <li>Gaji pokok</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  const wrap = omitPageHeader ? "space-y-6 py-6" : "mx-auto max-w-5xl space-y-6 p-6";

  return (
    <div className={wrap}>
      {!omitPageHeader && (
        <div>
          <h1 className="text-3xl font-bold text-slate-800">🏖️ Booking Cuti</h1>
          <p className="text-slate-500 mt-1">
            Ajukan tanggal cuti Anda; HR akan menyetujui atau menolak sesuai kebijakan &amp; kuota divisi.
          </p>
        </div>
      )}

      {monthlyBooking && (
        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-purple-100">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 font-bold text-purple-900">
                Booking bulan ini
                {monthlyBooking.monthLabel ? ` — ${monthlyBooking.monthLabel}` : ""}
              </h3>
              <p className="mb-3 text-sm text-purple-800/80">
                Maksimal {monthlyBooking.max}× pengajuan (pending + disetujui) per bulan kalender — sesuai kuota akun Anda
                di HR. Membatalkan pengajuan/cuti yang belum dimulai mengembalikan slot.
              </p>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white p-3 text-center">
                  <p className="mb-1 text-xs text-slate-500">Sudah dipakai</p>
                  <p className="text-2xl font-bold text-purple-700">{monthlyBooking.used}</p>
                  <p className="text-xs text-slate-500">kali booking</p>
                </div>
                <div className="rounded-lg bg-white p-3 text-center">
                  <p className="mb-1 text-xs text-slate-500">Sisa</p>
                  <p className="text-2xl font-bold text-green-700">
                    {Math.max(0, monthlyBooking.max - monthlyBooking.used)}
                  </p>
                  <p className="text-xs text-slate-500">dari {monthlyBooking.max}</p>
                </div>
              </div>
              <div className="rounded-lg bg-white p-2">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-600">Pemakaian slot booking</span>
                  <span className="font-bold text-purple-700">
                    {Math.round((monthlyBooking.used / monthlyBooking.max) * 100)}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      monthlyBooking.used >= monthlyBooking.max
                        ? "bg-red-500"
                        : monthlyBooking.used >= monthlyBooking.max - 1
                          ? "bg-orange-500"
                          : "bg-green-500"
                    }`}
                    style={{
                      width: `${Math.min(100, (monthlyBooking.used / monthlyBooking.max) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Kalender bulan penuh</h2>
          <p className="mt-1 text-sm text-slate-500">
            Kalender memuat cuti <em>Anda</em> saja: <strong>teal</strong> = disetujui, <strong>biru</strong> = menunggu HR.
            Kuota divisi per hari dicek saat <strong>HR menyetujui</strong>. Tap tanggal <strong>hijau</strong> untuk
            langsung kirim pengajuan <strong>satu hari</strong> (tanggal itu).
          </p>
        </div>
        <LeaveBookingCalendar
          year={viewMonth.getFullYear()}
          monthIndex={viewMonth.getMonth()}
          divisionFullDates={divisionFullDatesSet}
          divisionPartialDates={divisionPartialDatesSet}
          myBookedDates={myBookedDatesSet}
          myPendingDates={myPendingDatesSet}
          previewDates={previewDatesSet}
          todayYmd={todayYmdLocal()}
          loading={calLoading}
          submitting={calendarBooking}
          onPrevMonth={() => shiftCalendarMonth(-1)}
          onNextMonth={() => shiftCalendarMonth(1)}
          onPickDay={handleCalendarQuickBook}
        />
      </section>

      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 p-6">
        <div className="flex items-start gap-4">
          <Info className="mt-1 h-6 w-6 flex-shrink-0 text-indigo-600" />
          <div className="flex-1">
            <h3 className="mb-2 font-semibold text-slate-800">Ketentuan booking cuti</h3>
            <p className="mb-3 text-sm text-slate-600">
              Semua pengajuan di halaman ini lewat kalender: <strong>satu tanggal = satu pengajuan</strong> —{" "}
              <strong>{DAYS_PER_CALENDAR_BOOKING} hari kalender</strong> per tiket.
            </p>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg border border-indigo-100 bg-white p-3">
                <p className="mb-1 text-xs font-medium text-indigo-600">Satu pengajuan</p>
                <p className="text-lg font-bold text-indigo-700">{DAYS_PER_CALENDAR_BOOKING} hari</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ambil beberapa hari berturut dengan beberapa ketukan pada tanggal yang berbeda, atau konsultasi ke HR untuk
                  skema lain.
                </p>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-white p-3">
                <p className="mb-1 text-xs font-medium text-indigo-600">Kuota pengajuan / bulan</p>
                <p className="text-lg font-bold text-indigo-700">Maks. {monthlyQuotaMax}×</p>
                <p className="mt-1 text-xs text-slate-500">
                  Hitung pengajuan <strong>pending</strong> + <strong>disetujui</strong> dalam bulan kalender yang sama,
                  sampai diverifikasi HR.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-white p-3 md:items-center">
                <Users className="mt-0.5 h-8 w-8 flex-shrink-0 text-orange-500 md:mt-0" />
                <div>
                  <p className="text-xs font-medium text-orange-600">Kuota divisi per hari (HR)</p>
                  <p className="text-lg font-bold text-orange-700">Maks. {maxPeopleDisplay} orang</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Seksi divisi yang sama; penuh atau tidak ditetapkan saat HR menyetujui.
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-600">
              Divisi Anda untuk kuota: <strong>{userDivision || "…"}</strong> — harus cocok dengan data HR di koleksi{" "}
              <code className="rounded bg-slate-100 px-1 text-[11px]">division_quotas</code>.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Gagal</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700">
          <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Berhasil!</p>
            <p className="text-sm">{success}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <p className="text-sm text-slate-600">
          Semua pengajuan lewat ketukan kalender ({DAYS_PER_CALENDAR_BOOKING} hari per ketukan).
        </p>
        <button
          type="button"
          onClick={() => router.replace(HISTORY_TAB)}
          className="shrink-0 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          Lihat riwayat cuti
        </button>
      </div>

      <div className="space-y-3 rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-6">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <p className="font-semibold text-green-800">Pengajuan &amp; persetujuan HR</p>
        </div>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 font-bold text-green-600">✓</span>
            <span>
              <strong>Menunggu HR</strong> — setelah dikirim, tim HR menyetujui atau menolak
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 font-bold text-green-600">✓</span>
            <span>
              <strong>Kuota divisi</strong> dicek saat HR menyetujui (maks. {maxPeopleDisplay} orang/divisi/hari)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 font-bold text-blue-600">📅</span>
            <span>
              <strong>Satu ketukan = {DAYS_PER_CALENDAR_BOOKING} hari cuti</strong> (satu tanggal); beberapa hari = beberapa
              pengajuan terpisah
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 font-bold text-purple-600">📊</span>
            <span>
              <strong>Maks. {monthlyQuotaMax}×</strong> pengajuan (pending + disetujui) per bulan kalender (diatur HR per
              akun; default {getMaxBookingsPerMonth()}×)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 font-bold text-slate-600">∥</span>
            <span>
              <strong>Tidak boleh overlap</strong> — bertabrangan dengan pengajuan/cuti Anda yang aktif tidak diizinkan
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 font-bold text-orange-600">⚠</span>
            <span>
              <strong>Kuota divisi</strong> — maks. {maxPeopleDisplay} orang per hari untuk divisi yang sama (oleh HR saat ACC)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 font-bold text-blue-600">ℹ</span>
            <span>Bisa dibatalkan selama belum dimulai</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
