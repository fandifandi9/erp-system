/**
 * Absensi mobile — logika diselaraskan dengan `lib/attendance.ts` (Next.js),
 * tanpa API browser (Geolocation, localStorage).
 */
import { pb } from "./pocketbase";
import { getErrorMessage } from "./errors";
import { getCurrentLocation } from "./location";
import {
  detectSuspiciousGPSJump,
  enforceMaxGpsAccuracy,
  getDistance,
  validateGPSRadius,
} from "./gps";
import { getDeviceInfo } from "./device";
import {
  syncOperationalAccessAfterCheckIn,
  syncOperationalAccessAfterCheckOut,
} from "./operational-access-sync";
import { isRetriableTransportError } from "./network";
import { enqueueOfflineItem } from "./offline-queue/enqueue";

export const DEFAULT_LATE_TOLERANCE_MINUTES = 10;
const DEFAULT_OFFICE_RADIUS_M = 100;
const FIELD_ACTIVITY_COLLECTION = "field_activity_requests";

function pbEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseAttendanceBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["true", "1", "yes", "ya", "y", "on"].includes(t)) return true;
    if (["false", "0", "no", "tidak", "n", "off"].includes(t)) return false;
  }
  return fallback;
}

export interface AttendanceRecord {
  id: string;
  user: string;
  date: string;
  check_in?: string;
  check_out?: string;
  check_in_selfie?: string;
  status: "present" | "late" | "absent" | "leave";
  late_minutes: number;
  work_hours: number;
  lat?: number;
  lng?: number;
  distance_meter?: number;
  device_id?: string;
  ip_address?: string;
  is_suspicious: boolean;
}

export interface Office {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  is_active: boolean;
  address?: string;
  max_checkin_distance?: number;
  timezone?: string;
}

export interface AttendanceRules {
  maxLateMinutes: number | null;
  allowRemote: boolean;
  gpsRequired: boolean;
}

export interface Profile {
  id: string;
  user: string;
  name: string;
  email: string;
  office_id?: string;
  department?: string;
  shift_start: string;
  shift_end: string;
  shift_start_saturday?: string;
  shift_end_saturday?: string;
  shift_start_sunday?: string;
  shift_end_sunday?: string;
  shift_start_weekend?: string;
  shift_end_weekend?: string;
  work_end?: string;
  grace_minutes?: number;
  late_tolerance?: number;
  require_checkin_selfie?: boolean;
}

export async function fetchAttendanceRules(): Promise<AttendanceRules> {
  const defaults: AttendanceRules = {
    maxLateMinutes: null,
    allowRemote: false,
    gpsRequired: true,
  };
  try {
    const rows = await pb.collection("attendance_settings").getFullList({
      sort: "-created",
      requestKey: null,
    });
    const row = rows[0];
    if (!row) return defaults;
    let maxLateMinutes: number | null = null;
    const mx = row.max_late_minutes;
    if (mx !== undefined && mx !== null && Number.isFinite(Number(mx))) {
      maxLateMinutes = Math.min(Math.max(0, Math.floor(Number(mx))), 24 * 60);
    }
    return {
      maxLateMinutes,
      allowRemote: parseAttendanceBool(row.allow_remote, defaults.allowRemote),
      gpsRequired: parseAttendanceBool(row.gps_required, defaults.gpsRequired),
    };
  } catch {
    return defaults;
  }
}

export function effectiveOfficeRadiusMeters(office: Office): number {
  const rad =
    typeof office.radius === "number" &&
    Number.isFinite(office.radius) &&
    office.radius > 0
      ? office.radius
      : DEFAULT_OFFICE_RADIUS_M;
  const cap = office.max_checkin_distance;
  if (
    cap != null &&
    typeof cap === "number" &&
    Number.isFinite(cap) &&
    cap > 0
  ) {
    return Math.min(rad, cap);
  }
  return rad;
}

export function resolveProfileShift(profile: Profile): {
  shiftStart: string;
  shiftEndDisplay: string;
} {
  const shiftStart =
    (profile.shift_start && String(profile.shift_start).trim()) || "08:00";
  const shiftEndDisplay =
    (profile.shift_end && String(profile.shift_end).trim()) ||
    (profile.work_end && String(profile.work_end).trim()) ||
    "17:00";
  return { shiftStart, shiftEndDisplay };
}

export function isWeekendYmd(dateYmd: string): boolean {
  const ymd = dateYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function legacyWeekendShiftPair(profile: Profile): { start: string; end: string } | null {
  const a =
    profile.shift_start_weekend != null ? String(profile.shift_start_weekend).trim() : "";
  const b = profile.shift_end_weekend != null ? String(profile.shift_end_weekend).trim() : "";
  return a && b ? { start: a, end: b } : null;
}

export function resolveProfileShiftForDate(
  profile: Profile,
  dateYmd: string
): {
  shiftStart: string;
  shiftEndDisplay: string;
  usedCustomShiftForDay: boolean;
} {
  const base = resolveProfileShift(profile);
  if (!isWeekendYmd(dateYmd)) {
    return { ...base, usedCustomShiftForDay: false };
  }
  const ymd = dateYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return { ...base, usedCustomShiftForDay: false };
  }
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { ...base, usedCustomShiftForDay: false };
  }
  const dow = d.getDay();
  if (dow === 6) {
    const ss =
      profile.shift_start_saturday != null ? String(profile.shift_start_saturday).trim() : "";
    const se = profile.shift_end_saturday != null ? String(profile.shift_end_saturday).trim() : "";
    if (ss && se) {
      return {
        shiftStart: ss,
        shiftEndDisplay: se,
        usedCustomShiftForDay: true,
      };
    }
    const legSat = legacyWeekendShiftPair(profile);
    if (legSat) {
      return {
        shiftStart: legSat.start,
        shiftEndDisplay: legSat.end,
        usedCustomShiftForDay: true,
      };
    }
  }
  if (dow === 0) {
    const ss = profile.shift_start_sunday != null ? String(profile.shift_start_sunday).trim() : "";
    const se = profile.shift_end_sunday != null ? String(profile.shift_end_sunday).trim() : "";
    if (ss && se) {
      return {
        shiftStart: ss,
        shiftEndDisplay: se,
        usedCustomShiftForDay: true,
      };
    }
    const legSun = legacyWeekendShiftPair(profile);
    if (legSun) {
      return {
        shiftStart: legSun.start,
        shiftEndDisplay: legSun.end,
        usedCustomShiftForDay: true,
      };
    }
  }
  return { ...base, usedCustomShiftForDay: false };
}

export function getTodayDate(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseShiftTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const today = new Date();
  today.setHours(hours, minutes, 0, 0);
  return today;
}

export function calculateLateMinutes(
  checkInTime: Date,
  shiftStart: string
): number {
  const shiftStartTime = parseShiftTime(shiftStart);
  const diffMs = checkInTime.getTime() - shiftStartTime.getTime();
  return Math.max(0, Math.floor(diffMs / 1000 / 60));
}

export function resolveLateToleranceMinutes(
  profile: Profile,
  attendanceRules?: AttendanceRules | null
): number {
  let base = DEFAULT_LATE_TOLERANCE_MINUTES;
  const g = profile.grace_minutes;
  const lt = profile.late_tolerance;
  if (g !== undefined && g !== null && Number.isFinite(Number(g))) {
    base = Math.min(24 * 60, Math.max(0, Math.floor(Number(g))));
  } else if (
    lt !== undefined &&
    lt !== null &&
    Number.isFinite(Number(lt))
  ) {
    base = Math.min(24 * 60, Math.max(0, Math.floor(Number(lt))));
  }
  const cap =
    attendanceRules?.maxLateMinutes != null &&
    Number.isFinite(attendanceRules.maxLateMinutes)
      ? Math.max(0, Math.floor(attendanceRules.maxLateMinutes as number))
      : null;
  if (cap !== null) base = Math.min(base, cap);
  return base;
}

export function computeCheckInShiftOutcome(
  checkInTime: Date,
  shiftStart: string,
  toleranceMinutes: number
): { status: "present" | "late"; late_minutes: number } {
  const tol = Math.min(Math.max(0, Math.floor(toleranceMinutes)), 24 * 60);
  const minutesAfterShift = calculateLateMinutes(checkInTime, shiftStart);
  if (minutesAfterShift <= tol) {
    return { status: "present", late_minutes: 0 };
  }
  return {
    status: "late",
    late_minutes: minutesAfterShift - tol,
  };
}

export function calculateWorkHours(checkIn: string, checkOut: string): number {
  const checkInTime = new Date(checkIn);
  const checkOutTime = new Date(checkOut);
  const diffMs = checkOutTime.getTime() - checkInTime.getTime();
  const hours = diffMs / 1000 / 60 / 60;
  return Math.max(0, Math.round(hours * 100) / 100);
}

export async function getTodayAttendance(
  userId: string
): Promise<AttendanceRecord | null> {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const uid = pbEsc(userId);
    const todayStr = getTodayDate();
    const result = await pb.collection("attendance_logs").getList(1, 1, {
      filter: `user="${uid}" && ((created >= "${start.toISOString()}" && created <= "${end.toISOString()}") || date = "${todayStr}")`,
      sort: "-created",
      requestKey: null,
    });
    return result.items[0]
      ? (result.items[0] as unknown as AttendanceRecord)
      : null;
  } catch {
    return null;
  }
}

async function fetchLatestAttendanceWithCoordinates(
  userId: string
): Promise<{ lat: number; lng: number; checkIn: string } | null> {
  try {
    const uid = pbEsc(userId);
    const res = await pb.collection("attendance_logs").getList(1, 12, {
      filter: `user="${uid}"`,
      sort: "-created",
      requestKey: null,
    });
    for (const row of res.items) {
      const lat = row.lat as number | undefined;
      const lng = row.lng as number | undefined;
      const cin = row.check_in as string | undefined;
      if (
        typeof lat === "number" &&
        !Number.isNaN(lat) &&
        typeof lng === "number" &&
        !Number.isNaN(lng) &&
        cin
      ) {
        return { lat, lng, checkIn: cin };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function ensureProfileExists(userId: string): Promise<Profile> {
  try {
    const existing = await pb.collection("profiles").getFirstListItem(
      `user="${userId}"`,
      { expand: "office_id", requestKey: null }
    );
    return existing as unknown as Profile;
  } catch {
    let defaultOfficeId: string | null = null;
    try {
      const firstOffice = await pb.collection("offices").getFirstListItem(
        "is_active=true",
        { requestKey: null }
      );
      defaultOfficeId = firstOffice.id;
    } catch {
      throw new Error(
        "Tidak ada kantor aktif. Hubungi HR untuk pengaturan kantor."
      );
    }
    const newProfile = await pb.collection("profiles").create({
      user: userId,
      office_id: defaultOfficeId,
      shift_start: "08:00",
      shift_end: "17:00",
      department: "Unassigned",
      late_tolerance: DEFAULT_LATE_TOLERANCE_MINUTES,
    });
    return newProfile as unknown as Profile;
  }
}

export async function getUserProfile(userId: string): Promise<{
  profile: Profile | null;
  office: Office | null;
}> {
  try {
    const profile = await ensureProfileExists(userId);
    const profileWithOffice = await pb.collection("profiles").getOne(
      profile.id,
      { expand: "office_id", requestKey: null }
    );
    const office = profileWithOffice.expand?.office_id || null;
    return {
      profile: profileWithOffice as unknown as Profile,
      office: office as unknown as Office,
    };
  } catch {
    return { profile: null, office: null };
  }
}

export async function hasApprovedLeaveToday(userId: string): Promise<boolean> {
  const uid = pbEsc(userId);
  const todayStr = getTodayDate();
  const hybridFilter = `user="${uid}" && status="approved" && (
    date="${todayStr}" ||
    (start_date<="${todayStr}" && end_date>="${todayStr}")
  )`;
  const legacyFilter = `user="${uid}" && date="${todayStr}" && status="approved"`;
  try {
    await pb.collection("leave_requests").getFirstListItem(hybridFilter, {
      requestKey: null,
    });
    return true;
  } catch {
    try {
      await pb.collection("leave_requests").getFirstListItem(legacyFilter, {
        requestKey: null,
      });
      return true;
    } catch {
      return false;
    }
  }
}

async function userHasApprovedFieldActivityForDate(
  userId: string,
  ymd: string
): Promise<boolean> {
  if (!userId?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  try {
    const list = await pb.collection(FIELD_ACTIVITY_COLLECTION).getFullList({
      filter: `user="${pbEsc(userId)}" && status="approved" && start_date <= "${ymd}" && end_date >= "${ymd}"`,
      requestKey: null,
    });
    return list.length > 0;
  } catch {
    try {
      const all = await pb.collection(FIELD_ACTIVITY_COLLECTION).getFullList({
        filter: `user="${pbEsc(userId)}" && status="approved"`,
        requestKey: null,
      });
      return all.some((row) => {
        const sd = String((row as { start_date?: string }).start_date ?? "").slice(
          0,
          10
        );
        const ed = String((row as { end_date?: string }).end_date ?? "").slice(
          0,
          10
        );
        return sd <= ymd && ed >= ymd;
      });
    } catch {
      return false;
    }
  }
}

export function profileRequiresCheckinSelfie(
  profile: { require_checkin_selfie?: unknown } | null | undefined
): boolean {
  if (!profile) return false;
  return parseAttendanceBool(profile.require_checkin_selfie, false);
}

export type CheckInSelfiePayload = { uri: string; name?: string; type?: string };

export async function checkIn(
  userId: string,
  options?: { selfie?: CheckInSelfiePayload | null }
): Promise<{
  success: boolean;
  message: string;
  data?: AttendanceRecord;
  queued?: boolean;
}> {
  try {
    if (!userId) {
      return { success: false, message: "Belum login" };
    }
    const todayYmd = getTodayDate();
    const existing = await getTodayAttendance(userId);
    if (existing?.check_in && !existing.check_out) {
      return {
        success: false,
        message: "Sudah check-in hari ini. Check-out dulu.",
      };
    }
    if (await hasApprovedLeaveToday(userId)) {
      return {
        success: false,
        message: "Hari ini Anda sedang cuti (disetujui).",
      };
    }
    const { profile: profileRaw, office } = await getUserProfile(userId);
    if (!profileRaw) {
      return {
        success: false,
        message: "Profil tidak ditemukan. Hubungi HR.",
      };
    }
    const profile = profileRaw;
    if (profileRequiresCheckinSelfie(profile) && !options?.selfie?.uri) {
      return {
        success: false,
        message:
          "HR mewajibkan foto selfie saat check-in. Ambil foto dulu, lalu check-in lagi.",
      };
    }
    const { shiftStart } = resolveProfileShiftForDate(profile, todayYmd);
    const rules = await fetchAttendanceRules();
    const enforceGeo = !rules.allowRemote && rules.gpsRequired;
    let fieldActivityApproved = false;
    try {
      fieldActivityApproved = await userHasApprovedFieldActivityForDate(
        userId,
        todayYmd
      );
    } catch {
      fieldActivityApproved = false;
    }
    const strictRadius = enforceGeo && !fieldActivityApproved;
    let officeRadius = DEFAULT_OFFICE_RADIUS_M;
    if (strictRadius) {
      if (!office || !office.is_active) {
        return {
          success: false,
          message: "Kantor belum dikonfigurasi. Hubungi HR.",
        };
      }
      officeRadius = effectiveOfficeRadiusMeters(office);
    } else if (enforceGeo && fieldActivityApproved && office?.is_active) {
      officeRadius = effectiveOfficeRadiusMeters(office);
    }

    let userLocation: { lat: number; lng: number; accuracy: number } | null =
      null;
    let gpsValidation = {
      isValid: true,
      distance: 0,
      message: rules.allowRemote
        ? "Mode remote — zona tidak diwajibkan"
        : "GPS tidak wajib menurut kebijakan",
    };

    if (strictRadius) {
      if (!office) {
        return {
          success: false,
          message: "Data kantor tidak lengkap untuk validasi lokasi.",
        };
      }
      try {
        userLocation = await getCurrentLocation();
      } catch (error: unknown) {
        return {
          success: false,
          message: getErrorMessage(error, "Gagal mendapatkan lokasi GPS"),
        };
      }
      try {
        enforceMaxGpsAccuracy(userLocation.accuracy);
      } catch (accErr: unknown) {
        return {
          success: false,
          message: getErrorMessage(accErr, "Akurasi GPS ditolak"),
        };
      }
      gpsValidation = validateGPSRadius(
        userLocation.lat,
        userLocation.lng,
        office.lat,
        office.lng,
        officeRadius,
        userLocation.accuracy
      );
      if (!gpsValidation.isValid) {
        return { success: false, message: gpsValidation.message };
      }
    } else if (enforceGeo && fieldActivityApproved) {
      if (!office || !office.is_active) {
        return {
          success: false,
          message:
            "Profil kantor belum lengkap untuk audit aktivitas luar.",
        };
      }
      try {
        userLocation = await getCurrentLocation();
        enforceMaxGpsAccuracy(userLocation.accuracy);
      } catch (error: unknown) {
        return {
          success: false,
          message: getErrorMessage(
            error,
            "GPS diperlukan untuk audit aktivitas luar"
          ),
        };
      }
      const dist = Math.round(
        getDistance(
          userLocation.lat,
          userLocation.lng,
          office.lat,
          office.lng
        )
      );
      gpsValidation = {
        isValid: true,
        distance: dist,
        message: `Aktivitas luar disetujui — ~${dist} m dari kantor`,
      };
    } else {
      try {
        userLocation = await getCurrentLocation();
        if (office) {
          const d = Math.round(
            getDistance(
              userLocation.lat,
              userLocation.lng,
              office.lat,
              office.lng
            )
          );
          gpsValidation = {
            isValid: true,
            distance: d,
            message: `Lokasi opsional — ~${d} m dari kantor`,
          };
        }
      } catch {
        /* optional GPS */
      }
    }

    let gpsJumpSuspicious = false;
    if (userLocation) {
      const priorLoc = await fetchLatestAttendanceWithCoordinates(userId);
      if (priorLoc) {
        const diffMin =
          (Date.now() - new Date(priorLoc.checkIn).getTime()) / 60_000;
        gpsJumpSuspicious = detectSuspiciousGPSJump(
          priorLoc.lat,
          priorLoc.lng,
          userLocation.lat,
          userLocation.lng,
          Math.max(0, diffMin)
        );
      }
    }

    const deviceInfo = await getDeviceInfo();
    const suspiciousCombined =
      deviceInfo.isSuspicious || gpsJumpSuspicious;

    const now = new Date();
    const tolMin = resolveLateToleranceMinutes(profile, rules);
    const { status, late_minutes: lateMinutes } = computeCheckInShiftOutcome(
      now,
      shiftStart,
      tolMin
    );

    const dataToSave: Record<string, unknown> = {
      user: userId,
      date: todayYmd,
      check_in: now.toISOString(),
      status,
      late_minutes: lateMinutes,
      work_hours: 0,
      device_id: deviceInfo.deviceId,
      ip_address: deviceInfo.ipAddress,
      is_suspicious: suspiciousCombined,
    };

    if (userLocation !== null) {
      dataToSave.distance_meter = gpsValidation.distance;
    }
    if (userLocation) {
      dataToSave.lat = userLocation.lat;
      dataToSave.lng = userLocation.lng;
    }

    const selfie = options?.selfie;
    try {
      const record = await pb.collection("attendance_logs").create(
        selfie?.uri
          ? {
              ...dataToSave,
              check_in_selfie: {
                uri: selfie.uri,
                name: selfie.name || "checkin_selfie.jpg",
                type: selfie.type || "image/jpeg",
              },
            }
          : dataToSave
      );

      const op = await syncOperationalAccessAfterCheckIn(userId);
      if (!op.ok) {
        console.warn("[mobile] Akses web operasional tidak diperbarui (users / rule PB):", op.error);
      }

      return {
        success: true,
        message: `Absensi OK. ${gpsValidation.message}`,
        data: record as unknown as AttendanceRecord,
      };
    } catch (error: unknown) {
      if (!selfie?.uri && isRetriableTransportError(error)) {
        await enqueueOfflineItem({
          type: "attendance_checkin",
          payload: {
            user_id: userId,
            date_ymd: todayYmd,
            dataToSave,
          },
          idempotency_key: `att_ci_${userId}_${todayYmd}`,
        });
        return {
          success: true,
          queued: true,
          message: `Tersimpan lokal — akan disinkron otomatis. ${gpsValidation.message}`,
        };
      }
      return {
        success: false,
        message: getErrorMessage(error, "Check-in gagal"),
      };
    }
  } catch (error: unknown) {
    return {
      success: false,
      message: getErrorMessage(error, "Check-in gagal"),
    };
  }
}

export async function checkOut(userId: string): Promise<{
  success: boolean;
  message: string;
  data?: AttendanceRecord;
  queued?: boolean;
}> {
  try {
    if (!userId) {
      return { success: false, message: "Belum login" };
    }
    const record = await getTodayAttendance(userId);
    if (!record) {
      return { success: false, message: "Belum ada check-in hari ini" };
    }
    if (!record.check_in) {
      return { success: false, message: "Check-in dulu" };
    }
    if (record.check_out) {
      return { success: false, message: "Sudah check-out" };
    }
    const now = new Date();
    const workHours = calculateWorkHours(record.check_in, now.toISOString());
    const checkOutIso = now.toISOString();
    try {
      const updated = await pb.collection("attendance_logs").update(record.id, {
        check_out: checkOutIso,
        work_hours: workHours,
      });

      const op = await syncOperationalAccessAfterCheckOut(userId);
      if (!op.ok) {
        console.warn("[mobile] Cutoff akses web operasional gagal (users / rule PB):", op.error);
      }

      return {
        success: true,
        message: `Check-out OK. Jam kerja: ${workHours} j`,
        data: updated as unknown as AttendanceRecord,
      };
    } catch (error: unknown) {
      if (isRetriableTransportError(error)) {
        await enqueueOfflineItem({
          type: "attendance_checkout",
          payload: {
            user_id: userId,
            record_id: record.id,
            check_out: checkOutIso,
            work_hours: workHours,
          },
          idempotency_key: `att_co_${record.id}`,
        });
        return {
          success: true,
          queued: true,
          message: `Check-out tersimpan lokal — akan disinkron otomatis (±${workHours} j).`,
        };
      }
      return {
        success: false,
        message: getErrorMessage(error, "Check-out gagal"),
      };
    }
  } catch (error: unknown) {
    return {
      success: false,
      message: getErrorMessage(error, "Check-out gagal"),
    };
  }
}
