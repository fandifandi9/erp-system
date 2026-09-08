// ========================================
// 📊 ATTENDANCE BUSINESS LOGIC
// ========================================

import { pb } from "./pocketbase";
import {
  getCurrentLocation,
  validateGPSRadius,
  enforceMaxGpsAccuracy,
  getDistance,
} from "./gps";
import { detectSuspiciousGPSJump, getDeviceInfo } from "./device-fingerprint";
import { getErrorMessage } from "./errors";
import { userHasApprovedFieldActivityForDate } from "./field_activity";
import { getBusinessDateYmd } from "@/lib/hr/business-date";

/** Sejalan default form HR pegawai ketika profil tanpa toleransi eksplisit. */
export const DEFAULT_LATE_TOLERANCE_MINUTES = 10;

const DEFAULT_OFFICE_RADIUS_M = 100;

function parseAttendanceBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "ya", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "tidak", "n", "off"].includes(s)) return false;
  }
  return fallback;
}

/**
 * Ambil aturan HR dari koleksi attendance_settings (satu rekaman utama jika banyak).
 */
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
      maxLateMinutes = Math.min(
        Math.max(0, Math.floor(Number(mx))),
        24 * 60
      );
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

/** Radius efektif: nilai ≤ 0 di PB dianggap belum diisi → fallback aman */
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

/** Jam masuk keluar untuk logika absensi dari profil PocketBase */
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

/** Hari Sabtu atau Minggu untuk kalender tanggal `YYYY-MM-DD` (waktu setempat browser). */
export function isWeekendYmd(dateYmd: string): boolean {
  const ymd = dateYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/** Pasangan jam lawas `shift_*_weekend` (satu untuk Sabtu+Minggu) — dipakai jika hari spesifik kosong. */
function legacyWeekendShiftPair(profile: Profile): { start: string; end: string } | null {
  const a =
    profile.shift_start_weekend != null ? String(profile.shift_start_weekend).trim() : "";
  const b = profile.shift_end_weekend != null ? String(profile.shift_end_weekend).trim() : "";
  return a && b ? { start: a, end: b } : null;
}

/**
 * Jam kerja efektif menurut tanggal: Sabtu / Minggu bisa beda dari Sen–Jumat dan beda satu sama lain
 * bila HR mengisi pasangan shift per hari di profil.
 */
export function resolveProfileShiftForDate(profile: Profile, dateYmd: string): {
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

/** Escape PocketBase filter string literals */
function pbEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ========================================
// 🔐 TYPES
// ========================================

export interface AttendanceRecord {
  id: string;
  user: string;
  company_id?: string;
  date: string;
  check_in?: string;
  check_out?: string;
  check_in_selfie?: string;
  status: "present" | "late" | "absent" | "leave";
  late_minutes: number;
  early_leave_minutes?: number;
  overtime_minutes?: number;
  work_hours: number;
  lat?: number;
  lng?: number;
  distance_meter?: number;
  device_id?: string;
  ip_address?: string;
  is_suspicious: boolean;
  schedule_source?: string;
  schedule_start?: string;
  schedule_end?: string;
  schedule_timezone?: string;
  schedule_assignment_id?: string;
  late_grace_minutes?: number;
  early_leave_grace_minutes?: number;
  is_working_day?: boolean;
}

export interface Office {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // Changed from radius_meter to match PocketBase
  is_active: boolean;
  address?: string;
  max_checkin_distance?: number;
  timezone?: string;
}

/** Rekaman pertama `attendance_settings` (policy global HR). */
export interface AttendanceRules {
  /** Plafon menit tolerance (dibanding grace/tolerance pegawai yang lebih besar akan dipangkas). `null` = tanpa cap global */
  maxLateMinutes: number | null;
  /** true = boleh absensi tanpa validasi radius/GPS ketat */
  allowRemote: boolean;
  /** true = wajib GPS + zona kantor (kecuali `allowRemote`) */
  gpsRequired: boolean;
}

export interface Profile {
  id: string;
  user: string;
  department?: string;
  shift_start: string; // HH:mm format
  shift_end: string; // HH:mm format
  /** HH:mm — Sabtu, harus berpasangan shift_end_saturday */
  shift_start_saturday?: string;
  shift_end_saturday?: string;
  /** HH:mm — Minggu */
  shift_start_sunday?: string;
  shift_end_sunday?: string;
  /** @deprecated Lihat shift_start_saturday / shift_start_sunday */
  shift_start_weekend?: string;
  shift_end_weekend?: string;
  /** Alias di beberapa skema PocketBase */
  work_end?: string;
  office_id: string;
  /** Prioritas atas `late_tolerance` jika ada di PB */
  grace_minutes?: number;
  /** Menit grace setelah shift_start — masih dianggap on time */
  late_tolerance?: number;
  /** HR: wajibkan unggah foto selfie saat check-in (audit) */
  require_checkin_selfie?: boolean;
}

export interface LeaveRequest {
  id: string;
  user: string;
  date: string;
  status: "pending" | "approved" | "rejected";
}

// ========================================
// 📅 DATE HELPERS
// ========================================

/**
 * Business "today" for attendance / leave day keys.
 * Phase 35I-M: Asia/Jakarta — not device/browser local TZ.
 */
export function getTodayDate(): string {
  return getBusinessDateYmd();
}

/**
 * Parse shift time (HH:mm) to today's datetime
 */
export function parseShiftTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const today = new Date();
  today.setHours(hours, minutes, 0, 0);
  return today;
}

/**
 * Menit setelah jam shift (tanpa memotong tolerance) — berguna untuk laporan audit.
 */
export function calculateLateMinutes(checkInTime: Date, shiftStart: string): number {
  const shiftStartTime = parseShiftTime(shiftStart);
  const diffMs = checkInTime.getTime() - shiftStartTime.getTime();
  const diffMinutes = Math.floor(diffMs / 1000 / 60);
  return Math.max(0, diffMinutes);
}

/**
 * Status check-in dengan grace period dari profil: present jika sampai tepat/lebih besar dari tol menit sesudah shift_start.
 */
/**
 * Tolerance menit: `grace_minutes` lebih diutamakan dari `late_tolerance`,
 * lalu dibatasi plafon `attendance_rules.max_late_minutes` (jika ada).
 */
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
  if (cap !== null) {
    base = Math.min(base, cap);
  }
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

/**
 * Calculate work hours
 */
export function calculateWorkHours(checkIn: string, checkOut: string): number {
  const checkInTime = new Date(checkIn);
  const checkOutTime = new Date(checkOut);
  const diffMs = checkOutTime.getTime() - checkInTime.getTime();
  const hours = diffMs / 1000 / 60 / 60;
  return Math.max(0, Math.round(hours * 100) / 100); // 2 decimal places
}

// ========================================
// 🔍 DATA FETCHING
// ========================================

/**
 * Get latest attendance record for user (timezone-safe)
 * ✅ FIX: Fetch latest record instead of filtering by date to avoid timezone issues
 */
export async function getTodayAttendance(userId: string):
 Promise<AttendanceRecord | null> {
  try {
    const now = new Date();

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const uid = pbEsc(userId);
    const todayStr = getTodayDate();

    // Gabung jam lokal (`created`) + field tanggal PB (`date`) agar tetap konsisten lintas TZ / rekaman migrasi.
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

/**
 * Check-in dengan koordinat terakhir untuk heuristik loncat GPS tidak wajar.
 */
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

/**
 * 🔧 AUTO-CREATE profile if not exists
 */
async function ensureProfileExists(userId: string): Promise<Profile> {
  try {
    // Try to get existing profile
    const existing = await pb.collection("profiles").getFirstListItem(
      `user="${userId}"`,
      { expand: "office_id", requestKey: null }
    );
    
    return existing as unknown as Profile;
  } catch {
    // Profile doesn't exist, auto-create with defaults
    console.warn("⚠️ Profile not found for user", userId, "- Creating default profile...");
    
    // Get first active office as default
    let defaultOfficeId = null;
    try {
      const firstOffice = await pb.collection("offices").getFirstListItem(
        "is_active=true",
        { requestKey: null }
      );
      defaultOfficeId = firstOffice.id;
    } catch {
      throw new Error("No active office found. Please contact HR to setup office first.");
    }
    
    // Create default profile
    const newProfile = await pb.collection("profiles").create({
      user: userId,
      office_id: defaultOfficeId,
      shift_start: "08:00",
      shift_end: "17:00",
      department: "Unassigned",
      late_tolerance: DEFAULT_LATE_TOLERANCE_MINUTES,
    });
    
    console.log("✅ Auto-created profile:", newProfile.id);
    return newProfile as unknown as Profile;
  }
}

/**
 * Get user's profile with office info (with auto-create)
 */
export async function getUserProfile(userId: string): Promise<{
  profile: Profile | null;
  office: Office | null;
}> {
  try {
    // Ensure profile exists (auto-create if needed)
    const profile = await ensureProfileExists(userId);

    const profileWithOffice = await pb.collection("profiles").getOne(profile.id, {
      expand: "office_id",
      requestKey: null,
    });

    let office = (profileWithOffice.expand?.office_id as Office | undefined) || null;
    // profiles.office_id is often text (not relation) — expand may be empty.
    if (!office) {
      const officeId = String(
        (profileWithOffice as { office_id?: string }).office_id ?? profile.office_id ?? "",
      ).trim();
      if (officeId) {
        try {
          office = (await pb.collection("offices").getOne(officeId, {
            requestKey: null,
          })) as unknown as Office;
        } catch {
          office = null;
        }
      }
    }

    return {
      profile: profileWithOffice as unknown as Profile,
      office: office as Office | null,
    };
  } catch (error: unknown) {
    console.error("getUserProfile error:", error);
    return { profile: null, office: null };
  }
}

/**
 * Check if user has approved leave today
 */
export async function hasApprovedLeaveToday(userId: string): Promise<boolean> {
  const uid = pbEsc(userId);
  const todayStr = getTodayDate();
  const dayStart = `${todayStr} 00:00:00.000Z`;
  const dayEnd = `${todayStr} 23:59:59.999Z`;
  const filters = [
    `user="${uid}" && status="approved" && date >= "${dayStart}" && date <= "${dayEnd}"`,
    `user="${uid}" && status="approved" && date ~ "${todayStr}"`,
    `user="${uid}" && status="approved" && date="${todayStr}"`,
    `user="${uid}" && status="approved" && (start_date<="${todayStr}" && end_date>="${todayStr}")`,
  ];
  for (const filter of filters) {
    try {
      await pb.collection("leave_requests").getFirstListItem(filter, {
        requestKey: null,
      });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/**
 * Get attendance history for user
 */
export async function getAttendanceHistory(
  userId: string,
  page = 1,
  perPage = 30
): Promise<{ items: AttendanceRecord[]; totalPages: number }> {
  try {
    const result = await pb.collection("attendance_logs").getList(page, perPage, {
      filter: `user="${userId}"`,
      sort: "-date",
      requestKey: null,
    });

    return {
      items: result.items as unknown as AttendanceRecord[],
      totalPages: result.totalPages,
    };
  } catch {
    return { items: [], totalPages: 0 };
  }
}

/** HR mengaktifkan `profiles.require_checkin_selfie` → staff wajib lampirkan foto saat check-in. */
export function profileRequiresCheckinSelfie(
  profile: { require_checkin_selfie?: unknown } | null | undefined
): boolean {
  if (!profile) return false;
  return parseAttendanceBool(profile.require_checkin_selfie, false);
}

export type CheckInOptions = {
  /** Foto selfie check-in (file image). Wajib jika profil memakai `require_checkin_selfie`. */
  selfie?: File | Blob | null;
};

// ========================================
// ✅ CHECK-IN LOGIC
// ========================================
 
export async function checkIn(
  userId: string,
  options?: CheckInOptions
): Promise<{
  success: boolean;
  message: string;
  data?: AttendanceRecord;
}> {
  try {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("🚀 CHECK-IN PROCESS STARTED");
    console.log("═══════════════════════════════════════════════════\n");

    // 1. Validate user logged in
    console.log("📌 STEP 1: USER VALIDATION");
    console.log("├─ User ID:", userId);
    
    if (!userId) {
      console.log("└─ ❌ FAILED: No user ID\n");
      return { success: false, message: "User not logged in" };
    }
    
    // Get current user data
    const currentUser = pb.authStore.model;
    console.log("├─ User Role:", currentUser?.role || "unknown");
    console.log("└─ ✅ User validated\n");

    const todayYmd = getTodayDate();

    // 2. Check existing attendance today
    console.log("📌 STEP 2: EXISTING ATTENDANCE CHECK");
    const existing = await getTodayAttendance(userId);
    console.log("├─ Today:", todayYmd);
    console.log("├─ Latest record:", existing ? `ID: ${existing.id}` : "None");
    console.log("├─ Has check-in:", existing?.check_in ? "YES" : "NO");
    console.log("├─ Has check-out:", existing?.check_out ? "YES" : "NO");
    
    // ✅ FIX: Prevent multiple check-ins - only block if checked in but not checked out
    if (existing?.check_in && !existing.check_out) {
      console.log("└─ ❌ FAILED: Already checked in (not checked out yet)\n");
      return { success: false, message: "Already checked in today. Please check out first." };
    }
    console.log("└─ ✅ Can proceed with check-in\n");

    // 3. Check if user has approved leave
    console.log("📌 STEP 3: LEAVE REQUEST CHECK");
    const hasLeave = await hasApprovedLeaveToday(userId);
    console.log("├─ Has approved leave:", hasLeave ? "YES" : "NO");
    
    if (hasLeave) {
      console.log("└─ ❌ FAILED: On approved leave\n");
      return { success: false, message: "You are on approved leave today" };
    }
    console.log("└─ ✅ Not on leave\n");

    // 4. Get profile + office + kebijakan attendance_settings
    console.log("📌 STEP 4: PROFILE / OFFICE / ATTENDANCE RULES");
    const { profile: profileRaw, office } = await getUserProfile(userId);

    if (!profileRaw) {
      console.log("└─ ❌ FAILED: Profile not found\n");
      return { success: false, message: "Profile not found. Contact HR." };
    }

    const profile = profileRaw as Profile;
    const selfieRequired = profileRequiresCheckinSelfie(profile);
    if (selfieRequired && !options?.selfie) {
      return {
        success: false,
        message:
          "HR mewajibkan foto selfie saat check-in untuk akun Anda. Ambil foto terlebih dahulu, lalu check-in lagi.",
      };
    }

    const { shiftStart, shiftEndDisplay } = resolveProfileShiftForDate(profile, todayYmd);
    const rules = await fetchAttendanceRules();
    const enforceGeo = !rules.allowRemote && rules.gpsRequired;
    let fieldActivityApproved = false;
    try {
      fieldActivityApproved = await userHasApprovedFieldActivityForDate(userId, todayYmd);
    } catch {
      fieldActivityApproved = false;
    }
    const strictRadius = enforceGeo && !fieldActivityApproved;

    console.log("├─ 📋 PROFILE DATA:");
    console.log("│  ├─ Profile ID:", profile.id);
    console.log("│  ├─ Office ID:", profile.office_id);
    console.log("│  ├─ Department:", profile.department || "N/A");
    console.log("│  ├─ Shift Start:", shiftStart);
    console.log("│  └─ Shift End:", shiftEndDisplay);
    console.log("├─ ⚙️ attendance_settings:");
    console.log("│  ├─ allow_remote:", rules.allowRemote);
    console.log("│  ├─ gps_required:", rules.gpsRequired);
    console.log(
      "│  └─ max_late_minutes (cap global):",
      rules.maxLateMinutes ?? "—"
    );
    console.log("├─ 🧭 Pengajuan aktivitas luar (ACC HR, hari ini):", fieldActivityApproved ? "YA" : "tidak");

    let officeRadius = DEFAULT_OFFICE_RADIUS_M;
    if (strictRadius) {
      if (!office || !office.is_active) {
        console.log("└─ ❌ FAILED: Office not configured or inactive\n");
        return {
          success: false,
          message: "Office not configured. Contact HR.",
        };
      }
      officeRadius = effectiveOfficeRadiusMeters(office);
      console.log("├─ 🏢 OFFICE (wajib untuk zona):");
      console.log("│  ├─ Office ID:", office.id);
      console.log("│  ├─ Name:", office.name);
      console.log("│  ├─ Latitude:", office.lat);
      console.log("│  ├─ Longitude:", office.lng);
      console.log(
        "│  ├─ Radius PB → dipakai:",
        `${office.radius} m → ${officeRadius} m`
      );
      console.log("│  └─ Is Active:", office.is_active);
    } else if (enforceGeo && fieldActivityApproved) {
      if (office?.is_active) {
        officeRadius = effectiveOfficeRadiusMeters(office);
      }
      console.log("├─ 🏢 OFFICE: aktivitas luar disetujui — zona kantor tidak memblokir (audit jarak tetap dicatat jika ada GPS)");
    } else if (office) {
      console.log("├─ 🏢 OFFICE (opsional — tidak memblokir absensi):");
      console.log(
        "│  └─",
        `${office.name} (lat ${office.lat}, lng ${office.lng}, radius_pb ${office.radius})`
      );
    } else {
      console.log("├─ 🏢 OFFICE: tidak ada / tidak diperlukan untuk mode ini");
    }
    console.log("└─ ✅ Policy resolved\n");

    // 5–6. Lokasi & validasi radius
    console.log("📌 STEP 5–6: GPS & ZONA");
    let userLocation: { lat: number; lng: number; accuracy: number } | null =
      null;
    let gpsValidation = {
      isValid: true,
      distance: 0,
      message: rules.allowRemote
        ? "Mode remote — zona kantor tidak diwajibkan"
        : "Kebijakan: GPS tidak wajib — jarak ke kantor tidak divalidasi",
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
        console.log("├─ 📍 USER GPS DATA:");
        console.log("│  ├─ Latitude:", userLocation.lat);
        console.log("│  ├─ Longitude:", userLocation.lng);
        console.log("│  └─ Accuracy:", userLocation.accuracy, "meters");
        console.log("└─ ✅ GPS acquired\n");
      } catch (error: unknown) {
        const msg = getErrorMessage(error, "GPS permission denied");
        console.log("└─ ❌ FAILED: GPS error -", msg, "\n");
        return { success: false, message: msg };
      }

      try {
        enforceMaxGpsAccuracy(userLocation.accuracy);
      } catch (accErr: unknown) {
        const msg = getErrorMessage(accErr, "Akurasi GPS ditolak");
        return { success: false, message: msg };
      }

      gpsValidation = validateGPSRadius(
        userLocation.lat,
        userLocation.lng,
        office.lat,
        office.lng,
        officeRadius,
        userLocation.accuracy
      );

      console.log("├─ 📊 VALIDATION RESULT:");
      console.log("│  ├─ Distance:", gpsValidation.distance, "meters");
      console.log("│  ├─ Max Radius:", officeRadius, "meters");
      console.log("│  ├─ Is Valid:", gpsValidation.isValid ? "✅ YES" : "❌ NO");
      console.log("│  └─ Message:", gpsValidation.message);

      if (!gpsValidation.isValid) {
        console.log("└─ ❌ VALIDATION FAILED\n");
        return { success: false, message: gpsValidation.message };
      }
      console.log("└─ ✅ Within radius\n");
    } else if (enforceGeo && fieldActivityApproved) {
      if (!office || !office.is_active) {
        return {
          success: false,
          message:
            "Profil kantor belum lengkap. Hubungi HR, atau gunakan pengajuan aktivitas luar setelah ACC.",
        };
      }
      try {
        userLocation = await getCurrentLocation();
        enforceMaxGpsAccuracy(userLocation.accuracy);
      } catch (error: unknown) {
        const msg = getErrorMessage(error, "GPS diperlukan untuk audit aktivitas luar");
        return { success: false, message: msg };
      }
      const dist = Math.round(
        getDistance(userLocation.lat, userLocation.lng, office.lat, office.lng)
      );
      gpsValidation = {
        isValid: true,
        distance: dist,
        message: `Aktivitas luar disetujui HR — lokasi di luar radius kantor diizinkan (~${dist} m dari kantor)`,
      };
      console.log("└─ ✅ Field activity day: radius tidak memblokir, jarak audit:", dist, "m\n");
    } else {
      try {
        userLocation = await getCurrentLocation();
        console.log("├─ 📍 GPS opsional (tidak memblokir):", {
          lat: userLocation.lat,
          lng: userLocation.lng,
          accuracy: userLocation.accuracy,
        });
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
            message: `Lokasi opsional — ~${d} m dari kantor (tidak dipakai untuk blok)`,
          };
        }
        console.log("└─ ✅ GPS opsional tersimpan untuk audit\n");
      } catch {
        console.log("└─ ℹ️ GPS opsional tidak tersedia (diabaikan)\n");
      }
    }

    // 7. Heuristik loncat lokasi
    console.log("📌 STEP 7: GPS JUMP HEURISTIC");
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
    console.log(
      "└─ GPS jump suspicious:",
      gpsJumpSuspicious ? "⚠️ YES" : "✅ NO\n"
    );

    // 8. Device info
    console.log("📌 STEP 8: DEVICE INFO");
    const deviceInfo = await getDeviceInfo();
    console.log("├─ Device ID:", deviceInfo.deviceId.substring(0, 20) + "...");
    console.log("├─ IP Address:", deviceInfo.ipAddress);
    console.log("├─ Browser fingerprint flag:", deviceInfo.isSuspicious ? "⚠️ YES" : "✅ NO");

    const suspiciousCombined = deviceInfo.isSuspicious || gpsJumpSuspicious;
    console.log("└─ Combined suspicious:", suspiciousCombined ? "⚠️ YES" : "✅ NO\n");

    // 9. Shift + tolerance: grace_minutes / late_tolerance + cap attendance_settings
    const now = new Date();
    const tolMin = resolveLateToleranceMinutes(profile, rules);
    const { status, late_minutes: lateMinutes } = computeCheckInShiftOutcome(
      now,
      shiftStart,
      tolMin
    );

    console.log("📌 STEP 9: STATUS CALCULATION");
    console.log("├─ Check-in Time:", now.toLocaleTimeString("id-ID"));
    console.log("├─ Shift Start:", shiftStart);
    console.log("├─ Tolerance efektif (menit):", tolMin);
    console.log("├─ Late Minutes (beyond grace):", lateMinutes);
    console.log("└─ Status:", status === "late" ? "⏰ LATE" : "✅ ON TIME\n");

    // 10. Simpan attendance_logs
    console.log("📌 STEP 10: SAVE TO DATABASE");
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

    console.log("├─ 💾 DATA YANG DISIMPAN KE attendance_logs:");
    console.log("│  ├─ user:", dataToSave.user);
    console.log("│  ├─ date:", dataToSave.date);
    console.log("│  ├─ check_in:", dataToSave.check_in);
    console.log("│  ├─ status:", dataToSave.status);
    console.log("│  ├─ late_minutes:", dataToSave.late_minutes);
    console.log("│  ├─ lat:", dataToSave.lat ?? "(none)");
    console.log("│  ├─ lng:", dataToSave.lng ?? "(none)");
    console.log("│  ├─ distance_meter:", dataToSave.distance_meter ?? "(none)");
    console.log(
      "│  ├─ device_id:",
      String(dataToSave.device_id || "").substring(0, 20) + "..."
    );
    console.log("│  ├─ ip_address:", dataToSave.ip_address);
    console.log("│  └─ is_suspicious:", dataToSave.is_suspicious);

    const createBody: Record<string, unknown> = { ...dataToSave };
    if (options?.selfie) {
      createBody.check_in_selfie = options.selfie;
    }

    const record = await pb.collection("attendance_logs").create(createBody);

    console.log("└─ ✅ Saved to database (ID:", record.id, ")\n");

    // Operational user flags are synced by /api/hr/attendance (server admin PB).

    console.log("═══════════════════════════════════════════════════");
    console.log("✅ CHECK-IN SUCCESS!");
    console.log("═══════════════════════════════════════════════════\n");

    return {
      success: true,
      message: `Absensi OK. ${gpsValidation.message}`,
      data: record as unknown as AttendanceRecord,
    };
  } catch (error: unknown) {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("❌ CHECK-IN ERROR");
    console.log("═══════════════════════════════════════════════════");
    console.error("Error details:", error);
    console.log("═══════════════════════════════════════════════════\n");
    return {
      success: false,
      message: getErrorMessage(error, "Failed to check in"),
    };
  }
}

// ========================================
// 🔵 CHECK-OUT LOGIC
// ========================================

export async function checkOut(userId: string): Promise<{
  success: boolean;
  message: string;
  data?: AttendanceRecord;
}> {
  try {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("🔵 CHECK-OUT PROCESS STARTED");
    console.log("═══════════════════════════════════════════════════\n");

    // 1. Validate user
    console.log("📌 STEP 1: USER VALIDATION");
    console.log("├─ User ID:", userId);
    if (!userId) {
      console.log("└─ ❌ FAILED: No user ID\n");
      return { success: false, message: "User not logged in" };
    }
    console.log("└─ ✅ User validated\n");

    // 2. Get latest attendance record
    console.log("📌 STEP 2: FETCH LATEST RECORD");
    const record = await getTodayAttendance(userId);
    console.log("├─ Record found:", record ? "YES" : "NO");
    
    if (!record) {
      console.log("└─ ❌ FAILED: No record found\n");
      return { success: false, message: "No check-in record found" };
    }

    console.log("├─ Record ID:", record.id);
    console.log("├─ Check-in:", record.check_in || "None");
    console.log("├─ Check-out:", record.check_out || "None");

    // 3. Validate record state
    console.log("├─ 🔍 VALIDATION:");
    if (!record.check_in) {
      console.log("└─ ❌ FAILED: No check-in found\n");
      return { success: false, message: "Must check in first" };
    }

    if (record.check_out) {
      console.log("└─ ❌ FAILED: Already checked out\n");
      return { success: false, message: "Already checked out" };
    }
    console.log("└─ ✅ Record valid for check-out\n");

    // 4. Calculate work hours
    console.log("📌 STEP 3: CALCULATE WORK HOURS");
    const now = new Date();
    const workHours = calculateWorkHours(record.check_in, now.toISOString());
    console.log("├─ Check-in time:", new Date(record.check_in).toLocaleString("id-ID"));
    console.log("├─ Check-out time:", now.toLocaleString("id-ID"));
    console.log("└─ Work hours:", workHours, "hours\n");

    // 5. Update record
    console.log("📌 STEP 4: UPDATE DATABASE");
    console.log("├─ Updating record ID:", record.id);
    const updated = await pb.collection("attendance_logs").update(record.id, {
      check_out: now.toISOString(),
      work_hours: workHours,
    });
    console.log("└─ ✅ Record updated successfully\n");

    // Operational user flags are synced by /api/hr/attendance (server admin PB).

    console.log("═══════════════════════════════════════════════════");
    console.log("✅ CHECK-OUT SUCCESS!");
    console.log("═══════════════════════════════════════════════════\n");

    return {
      success: true,
      message: `Check-out successful! Work hours: ${workHours}h`,
      data: updated as unknown as AttendanceRecord,
    };
  } catch (error: unknown) {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("❌ CHECK-OUT ERROR");
    console.log("═══════════════════════════════════════════════════");
    console.error("Error details:", error);
    console.log("═══════════════════════════════════════════════════\n");
    return {
      success: false,
      message: getErrorMessage(error, "Failed to check out"),
    };
  }
}

// ========================================
// 📊 ADMIN FUNCTIONS
// ========================================

/**
 * Get all attendance records (for admin)
 */
export async function getAllAttendance(
  date?: string,
  page = 1,
  perPage = 50
): Promise<{ items: AttendanceRecord[]; totalPages: number }> {
  try {
    const filter = date ? `date="${date}"` : "";
    const result = await pb.collection("attendance_logs").getList(page, perPage, {
      filter,
      sort: "-date,-check_in",
      expand: "user",
      requestKey: null,
    });

    return {
      items: result.items as unknown as AttendanceRecord[],
      totalPages: result.totalPages,
    };
  } catch {
    return { items: [], totalPages: 0 };
  }
}

/**
 * Get suspicious attendance records (for admin)
 */
export async function getSuspiciousRecords(
  page = 1,
  perPage = 50
): Promise<{ items: AttendanceRecord[]; totalPages: number }> {
  try {
    const result = await pb.collection("attendance_logs").getList(page, perPage, {
      filter: "is_suspicious=true",
      sort: "-date",
      expand: "user",
      requestKey: null,
    });

    return {
      items: result.items as unknown as AttendanceRecord[],
      totalPages: result.totalPages,
    };
  } catch {
    return { items: [], totalPages: 0 };
  }
}
