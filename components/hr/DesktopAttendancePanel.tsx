"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { Clock, Loader2, MapPin, Camera } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { DEFAULT_MAX_GPS_ACCURACY_METERS, getCurrentLocation } from "@/lib/gps";
import {
  formatScheduleTimeRange,
  parseTodayAttendanceResponse,
  type TodayAttendanceClientPayload,
} from "@/lib/hr/attendance-today-client";
import { syncPbAuthCookie } from "@/lib/pb-auth-cookie";
import { getOperationalDashboardRoute } from "@/lib/rbac";
import { DESKTOP_ATTENDANCE_UNLOCK_PATH } from "@/lib/operational-access-gate";

type TodayPayload = TodayAttendanceClientPayload & {
  data: (TodayAttendanceClientPayload["data"] & {
    id?: string;
    late_minutes?: number;
    early_leave_minutes?: number;
    overtime_minutes?: number;
  }) | null;
  metrics?: {
    lateMinutes?: number;
    earlyLeaveMinutes?: number;
    overtimeMinutes?: number;
    status?: string;
  };
};

type Coords = { lat: number; lng: number; accuracy: number };

function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

function isAttendanceOfficeDebugAllowed(): boolean {
  // Production must never spoof office GPS. Explicit local debug only.
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  return (
    process.env.NEXT_PUBLIC_ATTENDANCE_DEBUG_OFFICE === "1" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  );
}

function applyOfficeDebugCoords(office: { lat: number; lng: number }) {
  if (typeof window === "undefined") return;
  if (!isAttendanceOfficeDebugAllowed()) return;
  localStorage.setItem("debug_lat", String(office.lat));
  localStorage.setItem("debug_lng", String(office.lng));
}

function resolvePostCheckInDestination(nextRaw: string | null): string {
  const next = String(nextRaw || "").trim();
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")) {
    if (
      next === DESKTOP_ATTENDANCE_UNLOCK_PATH ||
      next.startsWith(`${DESKTOP_ATTENDANCE_UNLOCK_PATH}?`) ||
      next.startsWith("/erp-locked")
    ) {
      return (
        getOperationalDashboardRoute(pb.authStore.model as Record<string, unknown>) ||
        "/dashboard-staff"
      );
    }
    return next;
  }
  // Setelah check-in, web_access aktif — home operasional (Director), bukan layar lock.
  return (
    getOperationalDashboardRoute(pb.authStore.model as Record<string, unknown>) ||
    "/dashboard-staff"
  );
}

export type DesktopAttendancePanelProps = {
  /**
   * Companion /mobile: jangan lempar ke dashboard setelah check-in.
   * Tampilkan status berhasil/gagal di tempat + tombol opsional buka ERP.
   */
  stayInPlace?: boolean;
};

export function DesktopAttendancePanel({ stayInPlace = false }: DesktopAttendancePanelProps) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const unlockNext = searchParams.get("next");
  const dateLocale = locale === "en" ? "en-US" : "id-ID";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>("");
  const [entityBrand, setEntityBrand] = useState<{ display_name: string; logo_url?: string | null } | null>(null);
  const [gpsTooCoarse, setGpsTooCoarse] = useState(false);
  const [openedDashboard, setOpenedDashboard] = useState(false);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  const office = today?.office ?? null;
  const requireSelfie = Boolean(today?.require_checkin_selfie);

  const openDashboardAfterUnlock = useCallback(async () => {
    if (stayInPlace) {
      try {
        await syncPbAuthCookie(pb);
      } catch {
        /* best-effort */
      }
      setSuccessMsg("Check-in berhasil.");
      return;
    }
    if (openedDashboard) return;
    setOpenedDashboard(true);
    try {
      await syncPbAuthCookie(pb);
    } catch {
      /* cookie sync best-effort */
    }
    router.replace(resolvePostCheckInDestination(unlockNext));
  }, [openedDashboard, router, unlockNext, stayInPlace]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/attendance/today", { headers: authHeaders(false) });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Gagal memuat absensi hari ini.");
      setToday(parseTodayAttendanceResponse(json) as TodayPayload | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    void fetch("/api/profile/self/entity-identity", { credentials: "include", headers: authHeaders(false) })
      .then((r) => r.json())
      .then((j: { data?: { display_name: string; logo_url?: string | null } }) => {
        if (j.data?.display_name) setEntityBrand(j.data);
      })
      .catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    return () => {
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    };
  }, [selfiePreview]);

  const record = today?.data;
  const checkedIn = Boolean(record?.check_in && !record?.check_out);
  const done = Boolean(record?.check_in && record?.check_out);

  // Datang dari gate (?next=) dan sudah check-in → buka dashboard (kecuali companion).
  useEffect(() => {
    if (stayInPlace || loading || openedDashboard || !unlockNext) return;
    if (checkedIn) void openDashboardAfterUnlock();
  }, [loading, checkedIn, unlockNext, openedDashboard, openDashboardAfterUnlock, stayInPlace]);

  const scheduleRange = formatScheduleTimeRange(today?.schedule);
  const scheduleLabel = scheduleRange
    ? scheduleRange
    : today?.schedule?.source === "none"
      ? locale === "en"
        ? "Not assigned"
        : "Belum ditentukan"
      : "—";

  async function resolveCheckInCoords(forceOffice = false): Promise<Coords> {
    if (forceOffice) {
      if (!isAttendanceOfficeDebugAllowed()) {
        throw new Error(
          "Bypass lokasi kantor dinonaktifkan. Gunakan GPS perangkat atau absen dari Mobile.",
        );
      }
      if (!office) {
        throw new Error("Kantor belum di-assign ke profil Anda. Set di HR → Karyawan.");
      }
      applyOfficeDebugCoords(office);
      return { lat: office.lat, lng: office.lng, accuracy: 1 };
    }

    const coords = await getCurrentLocation();
    const acc = Math.round(coords.accuracy || 0);
    if (acc > DEFAULT_MAX_GPS_ACCURACY_METERS) {
      setGpsTooCoarse(true);
      throw new Error(
        `Sinyal GPS PC tidak akurat (±${acc} m). Absen dari HP (Mobile) untuk GPS akurat, atau perbaiki sinyal lokasi PC.`,
      );
    }
    setGpsTooCoarse(false);
    return coords;
  }

  async function handleCheckIn(forceOffice = false) {
    const selfie = selfieFile;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    setGpsStatus("");
    try {
      if (requireSelfie && !selfie) {
        throw new Error(
          "HR mewajibkan foto selfie saat check-in. Ambil atau pilih foto terlebih dahulu.",
        );
      }
      const coords = await resolveCheckInCoords(forceOffice);
      const acc = Math.round(coords.accuracy || 0);
      setGpsStatus(
        forceOffice || acc <= 1
          ? `Lokasi kantor (${office?.name || "assigned"})`
          : `GPS OK (±${acc} m akurasi)`,
      );

      let res: Response;
      if (selfie) {
        const form = new FormData();
        form.append("lat", String(coords.lat));
        form.append("lng", String(coords.lng));
        form.append("accuracy", String(coords.accuracy));
        form.append("client_channel", "web");
        form.append("selfie", selfie);
        res = await fetch("/api/hr/attendance/check-in", {
          method: "POST",
          headers: { Authorization: authHeaders(false).Authorization || "" },
          body: form,
        });
      } else {
        res = await fetch("/api/hr/attendance/check-in", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            lat: coords.lat,
            lng: coords.lng,
            accuracy: coords.accuracy,
            client_channel: "web",
          }),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || "Check-in gagal.");
      setGpsTooCoarse(false);
      setSelfieFile(null);
      if (selfiePreview) {
        URL.revokeObjectURL(selfiePreview);
        setSelfiePreview(null);
      }
      await reload();
      await openDashboardAfterUnlock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in gagal.");
    } finally {
      setBusy(false);
    }
  }

  function onPickSelfie(file: File | null) {
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    if (!file) {
      setSelfieFile(null);
      setSelfiePreview(null);
      return;
    }
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
    setError(null);
  }

  async function handleCheckOut() {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/hr/attendance/check-out", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ client_channel: "web" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || "Check-out gagal.");
      await reload();
      if (stayInPlace) {
        try {
          await syncPbAuthCookie(pb);
        } catch {
          /* best-effort */
        }
        setSuccessMsg("Check-out berhasil.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-out gagal.");
    } finally {
      setBusy(false);
    }
  }

  const nowLabel = new Date().toLocaleDateString(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Memuat absensi…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {entityBrand ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          {entityBrand.logo_url ? (
            <img src={entityBrand.logo_url} alt="" className="h-10 w-10 rounded-lg border border-slate-200 object-contain p-0.5" />
          ) : null}
          <div>
            <p className="text-xs text-slate-500">Entitas</p>
            <p className="font-semibold text-slate-900">{entityBrand.display_name}</p>
          </div>
        </div>
      ) : null}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Absensi</h1>
        <p className="mt-1 text-sm text-slate-600">{nowLabel}</p>
        {unlockNext && !stayInPlace ? (
          <p className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            Check-in dengan GPS di radius kantor. Jika berhasil, modul akan terbuka:{" "}
            <span className="font-semibold">{unlockNext}</span>
          </p>
        ) : null}
        {unlockNext && stayInPlace ? (
          <p className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            Check-in dengan GPS di radius kantor. Hasil berhasil atau ditolak tampil di sini.
          </p>
        ) : null}
        {office ? (
          <p className="mt-1 text-xs text-slate-500">
            Kantor: {office.name} ({office.lat.toFixed(5)}, {office.lng.toFixed(5)}) · radius {office.radius} m
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-700">Kantor belum di-assign ke profil — hubungi HR.</p>
        )}
      </div>

      {error ? (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-semibold">Absensi ditolak</p>
          <p>{error}</p>
          {office &&
          isAttendanceOfficeDebugAllowed() &&
          (gpsTooCoarse || /GPS|lokasi|akurasi/i.test(error)) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCheckIn(true)}
              className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              DEBUG saja: Pakai lokasi kantor ({office.name})
            </button>
          ) : null}
        </div>
      ) : null}

      {successMsg ? (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">Absensi berhasil</p>
          <p>{successMsg}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Jadwal hari ini</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Clock className="h-5 w-5 text-indigo-600" />
            {scheduleLabel}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {!record?.check_in
              ? "Belum absen"
              : done
                ? "Selesai"
                : checkedIn
                  ? "Sudah check-in"
                  : "—"}
          </p>
          {gpsStatus ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
              <MapPin className="h-3.5 w-3.5" />
              {gpsStatus}
            </p>
          ) : null}
        </div>
      </div>

      {(record?.late_minutes ?? today?.metrics?.lateMinutes) ? (
        <p className="text-sm text-amber-700">
          Terlambat: {record?.late_minutes ?? today?.metrics?.lateMinutes} menit
        </p>
      ) : null}

      {!checkedIn && !done ? (
        <div
          className={`rounded-xl border px-4 py-3 ${
            requireSelfie
              ? "border-indigo-200 bg-indigo-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">
            {requireSelfie ? "Foto selfie wajib (audit HR)" : "Foto selfie (opsional)"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {requireSelfie
              ? "Ambil atau pilih foto wajah sebelum CHECK IN. Tanpa selfie, absensi ditolak."
              : "Bisa dilampirkan untuk audit; tidak wajib untuk akun ini."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
              <Camera className="h-4 w-4" />
              {selfieFile ? "Ganti foto" : "Ambil / pilih foto"}
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  onPickSelfie(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            {selfieFile ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPickSelfie(null)}
                className="text-xs font-medium text-slate-500 underline"
              >
                Hapus
              </button>
            ) : null}
          </div>
          {selfiePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selfiePreview}
              alt="Preview selfie"
              className="mt-3 h-28 w-28 rounded-xl border border-slate-200 object-cover"
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!checkedIn && !done ? (
          <>
            <button
              type="button"
              disabled={busy || (requireSelfie && !selfieFile)}
              onClick={() => void handleCheckIn()}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-indigo-700 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Memproses…" : "CHECK IN"}
            </button>
            {office && isAttendanceOfficeDebugAllowed() ? (
              <button
                type="button"
                disabled={busy || (requireSelfie && !selfieFile)}
                onClick={() => void handleCheckIn(true)}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 disabled:opacity-60"
              >
                DEBUG: lokasi kantor
              </button>
            ) : null}
          </>
        ) : null}
        {checkedIn && !done ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCheckOut()}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-800 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Memproses…" : "CHECK OUT"}
          </button>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        Riwayat:{" "}
        <Link
          href={stayInPlace ? "/mobile/attendance/history" : "/dashboard-staff/attendance/history"}
          className="text-indigo-600 underline"
        >
          lihat riwayat absensi
        </Link>
      </p>
    </div>
  );
}
