/**
 * Server-side attendance mutations (Phase 11 / Wave 3 HR).
 * All writes use admin PocketBase after auth checks.
 */
import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import {
  calculateWorkHours,
  computeCheckInShiftOutcome,
  effectiveOfficeRadiusMeters,
  getTodayDate,
  profileRequiresCheckinSelfie,
  resolveLateToleranceMinutes,
  resolveProfileShiftForDate,
  type AttendanceRecord,
  type Office,
  type Profile,
} from "@/lib/attendance";
import { enforceMaxGpsAccuracy, getDistance, validateGPSRadius } from "@/lib/gps";
import { FIELD_ACTIVITY_COLLECTION } from "@/lib/field_activity";
import {
  syncOperationalAccessAfterCheckIn,
  syncOperationalAccessAfterCheckOut,
} from "@/lib/operational-access-sync";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";

const ATTENDANCE_COLLECTION = "attendance_logs";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function fetchAttendanceRulesAdmin(adminPb: PocketBase) {
  const defaults = { maxLateMinutes: null as number | null, allowRemote: false, gpsRequired: true };
  try {
    const rows = await adminPb.collection("attendance_settings").getFullList({
      sort: "-created",
      requestKey: null,
    });
    const row = rows[0];
    if (!row) return defaults;
    const parseBool = (v: unknown, fb: boolean) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (["true", "1", "yes", "ya"].includes(s)) return true;
        if (["false", "0", "no", "tidak"].includes(s)) return false;
      }
      return fb;
    };
    let maxLateMinutes: number | null = null;
    const mx = row.max_late_minutes;
    if (mx != null && Number.isFinite(Number(mx))) {
      maxLateMinutes = Math.min(Math.max(0, Math.floor(Number(mx))), 24 * 60);
    }
    return {
      maxLateMinutes,
      allowRemote: parseBool(row.allow_remote, defaults.allowRemote),
      gpsRequired: parseBool(row.gps_required, defaults.gpsRequired),
    };
  } catch {
    return defaults;
  }
}

async function hasFieldActivityApprovedAdmin(
  adminPb: PocketBase,
  userId: string,
  ymd: string,
): Promise<boolean> {
  if (!userId?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  try {
    const list = await adminPb.collection(FIELD_ACTIVITY_COLLECTION).getFullList({
      filter: `user="${pbEscape(userId)}" && status="approved" && start_date <= "${ymd}" && end_date >= "${ymd}"`,
      requestKey: null,
    });
    return list.length > 0;
  } catch {
    return false;
  }
}

async function hasApprovedLeaveTodayAdmin(adminPb: PocketBase, userId: string): Promise<boolean> {
  const uid = pbEscape(userId);
  const todayStr = getTodayDate();
  // Live schema: leave_requests.date is PocketBase `date` (stored as datetime).
  // Exact equality with YYYY-MM-DD often misses; use day-range + optional start/end fields.
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
      await adminPb.collection("leave_requests").getFirstListItem(filter, { requestKey: null });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export type AttendanceMutationResult = {
  success: boolean;
  message: string;
  data?: AttendanceRecord;
  id?: string;
};

export type ServerCheckInInput = {
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  device_id?: string | null;
  /** Optional selfie file from multipart */
  selfie?: File | Blob | null;
};

async function assertUserActive(adminPb: PocketBase, userId: string): Promise<void> {
  try {
    const u = (await adminPb.collection("users").getOne(userId, {
      fields: "id,status",
      requestKey: null,
    })) as Record<string, unknown>;
    const st = String(u.status ?? "active").trim().toLowerCase();
    if (st && st !== "active") {
      throw new HrApiError("Akun tidak aktif. Hubungi HR.", 403);
    }
  } catch (e) {
    if (e instanceof HrApiError) throw e;
    throw new HrApiError("User tidak ditemukan.", 403);
  }
}

async function getTodayAttendanceAdmin(
  adminPb: PocketBase,
  userId: string,
): Promise<AttendanceRecord | null> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const uid = pbEscape(userId);
  const todayStr = getTodayDate();
  const result = await adminPb.collection(ATTENDANCE_COLLECTION).getList(1, 1, {
    filter: `user="${uid}" && ((created >= "${start.toISOString()}" && created <= "${end.toISOString()}") || date = "${todayStr}")`,
    sort: "-created",
    requestKey: null,
  });
  return result.items[0] ? (result.items[0] as unknown as AttendanceRecord) : null;
}

async function getUserProfileAdmin(
  adminPb: PocketBase,
  userId: string,
): Promise<{ profile: Profile | null; office: Office | null }> {
  try {
    const profile = (await adminPb.collection("profiles").getFirstListItem(
      `user="${pbEscape(userId)}"`,
      { expand: "office_id", requestKey: null },
    )) as unknown as Profile & { expand?: { office_id?: Office } };
    const office = (profile.expand?.office_id as Office | undefined) ?? null;
    return { profile, office };
  } catch {
    return { profile: null, office: null };
  }
}

/** HR/Owner: list attendance for users in actor company scope. */
export async function serverListAttendanceForHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: { date?: string; userId?: string; page?: number; perPage?: number },
): Promise<{ items: AttendanceRecord[]; totalItems: number; totalPages: number }> {
  if (!ctx.isOwner && !ctx.isHr) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }

  const page = Math.max(1, input.page ?? 1);
  const perPage = Math.min(100, Math.max(1, input.perPage ?? 50));
  const filters: string[] = [];

  if (input.date?.trim()) {
    const d = input.date.trim().slice(0, 10);
    filters.push(`date = "${pbEscape(d)}"`);
  }

  if (input.userId?.trim()) {
    const targetId = input.userId.trim();
    if (!ctx.isOwner) {
      const subjectCompanies = await getAccessibleCompanyIds(adminPb, targetId);
      const overlap = subjectCompanies.some((id) => ctx.companyIds.includes(id));
      if (!overlap) {
        throw new HrApiError("Akses lintas entitas ditolak.", 403);
      }
    }
    filters.push(`user = "${pbEscape(targetId)}"`);
  } else if (!ctx.isOwner && ctx.companyIds.length > 0) {
    const memberships = await adminPb.collection("biz_user_companies").getFullList<{ user: string }>({
      filter: ctx.companyIds.map((c) => `company="${pbEscape(c)}"`).join(" || "),
      fields: "user",
      requestKey: null,
    });
    const userIds = [...new Set(memberships.map((m) => m.user).filter(Boolean))];
    if (userIds.length === 0) {
      return { items: [], totalItems: 0, totalPages: 0 };
    }
    const chunk = userIds.slice(0, 40).map((id) => `user="${pbEscape(id)}"`).join(" || ");
    filters.push(`(${chunk})`);
  } else if (!ctx.isOwner && ctx.companyIds.length === 0) {
    throw new HrApiError("Scope entitas HR tidak dapat ditentukan.", 403);
  }

  const filter = filters.length ? filters.join(" && ") : "";
  const result = await adminPb.collection(ATTENDANCE_COLLECTION).getList(page, perPage, {
    filter,
    sort: "-date,-check_in",
    expand: "user",
    requestKey: null,
  });

  return {
    items: result.items as unknown as AttendanceRecord[],
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  };
}

export async function serverGetTodayAttendance(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<AttendanceRecord | null> {
  return getTodayAttendanceAdmin(adminPb, ctx.userId);
}

export async function serverCheckIn(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: ServerCheckInInput,
): Promise<AttendanceMutationResult> {
  const userId = ctx.userId;
  await assertUserActive(adminPb, userId);

  const todayYmd = getTodayDate();
  const existing = await getTodayAttendanceAdmin(adminPb, userId);
  if (existing?.check_in && !existing.check_out) {
    return { success: false, message: "Sudah absen masuk hari ini. Absen pulang dulu." };
  }

  if (await hasApprovedLeaveTodayAdmin(adminPb, userId)) {
    return { success: false, message: "Anda sedang cuti disetujui hari ini." };
  }

  const { profile, office } = await getUserProfileAdmin(adminPb, userId);
  if (!profile) {
    return { success: false, message: "Profil karyawan tidak ditemukan. Hubungi HR." };
  }

  const selfieRequired = profileRequiresCheckinSelfie(profile);
  if (selfieRequired && !input.selfie) {
    return {
      success: false,
      message:
        "HR mewajibkan foto selfie saat check-in. Lampirkan foto terlebih dahulu.",
    };
  }

  const rules = await fetchAttendanceRulesAdmin(adminPb);
  const enforceGeo = !rules.allowRemote && rules.gpsRequired;
  let fieldActivityApproved = false;
  try {
    fieldActivityApproved = await hasFieldActivityApprovedAdmin(adminPb, userId, todayYmd);
  } catch {
    fieldActivityApproved = false;
  }

  const strictRadius = enforceGeo && !fieldActivityApproved;
  const officeRadius = office ? effectiveOfficeRadiusMeters(office) : 100;

  let lat = input.lat ?? null;
  let lng = input.lng ?? null;
  let accuracy = input.accuracy ?? null;

  let gpsValidation = {
    isValid: true,
    distance: 0,
    message: rules.allowRemote
      ? "Mode remote — zona tidak diwajibkan"
      : "GPS tidak wajib menurut kebijakan",
  };

  if (strictRadius) {
    if (!office?.is_active) {
      return { success: false, message: "Data kantor tidak lengkap untuk validasi lokasi." };
    }
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { success: false, message: "Koordinat GPS wajib untuk absensi." };
    }
    try {
      enforceMaxGpsAccuracy(accuracy ?? undefined);
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : "Akurasi GPS ditolak",
      };
    }
    gpsValidation = validateGPSRadius(
      lat,
      lng,
      office.lat,
      office.lng,
      officeRadius,
      accuracy,
    );
    if (!gpsValidation.isValid) {
      return { success: false, message: gpsValidation.message };
    }
  } else if (enforceGeo && fieldActivityApproved && office) {
    if (lat == null || lng == null) {
      return { success: false, message: "GPS diperlukan untuk audit aktivitas luar." };
    }
    try {
      enforceMaxGpsAccuracy(accuracy ?? undefined);
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : "Akurasi GPS ditolak",
      };
    }
    const dist = Math.round(getDistance(lat, lng, office.lat, office.lng));
    gpsValidation = {
      isValid: true,
      distance: dist,
      message: `Aktivitas luar disetujui — ~${dist} m dari kantor`,
    };
  }

  const { shiftStart } = resolveProfileShiftForDate(profile, todayYmd);
  const tolMin = resolveLateToleranceMinutes(profile, rules);
  const now = new Date();
  const { status, late_minutes: lateMinutes } = computeCheckInShiftOutcome(now, shiftStart, tolMin);

  const createBody: Record<string, unknown> = {
    user: userId,
    date: todayYmd,
    check_in: now.toISOString(),
    status,
    late_minutes: lateMinutes,
    work_hours: 0,
    is_suspicious: false,
  };

  if (input.device_id?.trim()) {
    createBody.device_id = input.device_id.trim().slice(0, 128);
  }
  if (lat != null && lng != null) {
    createBody.lat = lat;
    createBody.lng = lng;
    createBody.distance_meter = gpsValidation.distance;
  }
  if (input.selfie) {
    createBody.check_in_selfie = input.selfie;
  }

  const record = await adminPb.collection(ATTENDANCE_COLLECTION).create(createBody);
  await syncOperationalAccessAfterCheckIn(userId).catch(() => undefined);

  return {
    success: true,
    message: `Absensi OK. ${gpsValidation.message}`,
    data: record as unknown as AttendanceRecord,
    id: record.id,
  };
}

export async function serverCheckOut(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<AttendanceMutationResult> {
  const userId = ctx.userId;
  await assertUserActive(adminPb, userId);

  const record = await getTodayAttendanceAdmin(adminPb, userId);
  if (!record) {
    return { success: false, message: "Belum ada absen masuk hari ini." };
  }
  if (!record.check_in) {
    return { success: false, message: "Absen masuk dulu." };
  }
  if (record.check_out) {
    return { success: false, message: "Sudah absen pulang." };
  }

  const now = new Date();
  const workHours = calculateWorkHours(record.check_in, now.toISOString());
  const updated = await adminPb.collection(ATTENDANCE_COLLECTION).update(record.id, {
    check_out: now.toISOString(),
    work_hours: workHours,
  });
  await syncOperationalAccessAfterCheckOut(userId).catch(() => undefined);

  return {
    success: true,
    message: `Absen pulang OK. Jam kerja: ${workHours} j`,
    data: updated as unknown as AttendanceRecord,
    id: updated.id,
  };
}

/** Reject client attempts to forge attendance identity or privileged fields. */
export function rejectClientAttendanceForgeFields(body: Record<string, unknown>): void {
  const forbidden = [
    "user",
    "userId",
    "user_id",
    "status",
    "check_in",
    "check_out",
    "check_in_selfie",
    "late_minutes",
    "work_hours",
    "is_suspicious",
    "date",
    "company_id",
    "company",
  ] as const;
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new HrApiError(`Field '${key}' tidak boleh dikirim oleh klien.`, 400);
    }
  }
}

const ATTENDANCE_STATUS = new Set(["present", "late", "absent", "leave"]);

export type ServerCorrectAttendanceInput = {
  /** Required human reason for the correction (audit). */
  reason: string;
  check_in?: string | null;
  check_out?: string | null;
  status?: string | null;
  late_minutes?: number | null;
  work_hours?: number | null;
  is_suspicious?: boolean | null;
  /** Clear check_out when true (forgot checkout undo). */
  clear_check_out?: boolean;
};

async function assertHrCanCorrectUser(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
): Promise<void> {
  if (!ctx.isOwner && !ctx.isHr) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }
  if (ctx.isOwner) return;
  if (ctx.companyIds.length === 0) {
    throw new HrApiError("Scope entitas HR tidak dapat ditentukan.", 403);
  }
  const subjectCompanies = await getAccessibleCompanyIds(adminPb, targetUserId);
  const overlap = subjectCompanies.some((id) => ctx.companyIds.includes(id));
  if (!overlap) {
    throw new HrApiError("Akses lintas entitas ditolak.", 403);
  }
}

/**
 * HR/Owner manual attendance correction — existing schema fields only.
 * Always requires reason; writes audit event to biz_activity_events.
 */
export async function serverCorrectAttendance(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  recordId: string,
  input: ServerCorrectAttendanceInput,
): Promise<AttendanceMutationResult> {
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) {
    throw new HrApiError("Alasan koreksi wajib (minimal 5 karakter).", 400);
  }
  if (!recordId?.trim()) {
    throw new HrApiError("ID absensi wajib.", 400);
  }

  let existing: AttendanceRecord;
  try {
    existing = (await adminPb.collection(ATTENDANCE_COLLECTION).getOne(recordId.trim(), {
      requestKey: null,
    })) as unknown as AttendanceRecord;
  } catch {
    throw new HrApiError("Catatan absensi tidak ditemukan.", 404);
  }

  const targetUserId = String(existing.user || "");
  if (!targetUserId) {
    throw new HrApiError("Catatan absensi tidak memiliki user.", 400);
  }
  await assertHrCanCorrectUser(adminPb, ctx, targetUserId);

  const before: Record<string, unknown> = {
    check_in: existing.check_in ?? null,
    check_out: existing.check_out ?? null,
    status: existing.status,
    late_minutes: existing.late_minutes,
    work_hours: existing.work_hours,
    is_suspicious: existing.is_suspicious,
  };

  const patch: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (Object.prototype.hasOwnProperty.call(input, "check_in") && input.check_in !== undefined) {
    const v = input.check_in === null || input.check_in === "" ? null : String(input.check_in);
    if (v !== null && Number.isNaN(Date.parse(v))) {
      throw new HrApiError("Format check_in tidak valid.", 400);
    }
    patch.check_in = v;
    changes.check_in = { from: before.check_in, to: v };
  }
  if (input.clear_check_out) {
    patch.check_out = null;
    changes.check_out = { from: before.check_out, to: null };
  } else if (Object.prototype.hasOwnProperty.call(input, "check_out") && input.check_out !== undefined) {
    const v = input.check_out === null || input.check_out === "" ? null : String(input.check_out);
    if (v !== null && Number.isNaN(Date.parse(v))) {
      throw new HrApiError("Format check_out tidak valid.", 400);
    }
    patch.check_out = v;
    changes.check_out = { from: before.check_out, to: v };
  }
  if (input.status != null && String(input.status).trim()) {
    const st = String(input.status).trim().toLowerCase();
    if (!ATTENDANCE_STATUS.has(st)) {
      throw new HrApiError("Status absensi tidak valid.", 400);
    }
    patch.status = st;
    changes.status = { from: before.status, to: st };
  }
  if (input.late_minutes != null && Number.isFinite(Number(input.late_minutes))) {
    const n = Math.max(0, Math.floor(Number(input.late_minutes)));
    patch.late_minutes = n;
    changes.late_minutes = { from: before.late_minutes, to: n };
  }
  if (input.work_hours != null && Number.isFinite(Number(input.work_hours))) {
    const n = Math.max(0, Math.round(Number(input.work_hours) * 100) / 100);
    patch.work_hours = n;
    changes.work_hours = { from: before.work_hours, to: n };
  } else if (patch.check_in != null && patch.check_out != null) {
    patch.work_hours = calculateWorkHours(String(patch.check_in), String(patch.check_out));
    changes.work_hours = { from: before.work_hours, to: patch.work_hours };
  } else if (patch.check_in != null && existing.check_out && !input.clear_check_out) {
    patch.work_hours = calculateWorkHours(String(patch.check_in), String(existing.check_out));
    changes.work_hours = { from: before.work_hours, to: patch.work_hours };
  } else if (patch.check_out != null && existing.check_in) {
    patch.work_hours = calculateWorkHours(String(existing.check_in), String(patch.check_out));
    changes.work_hours = { from: before.work_hours, to: patch.work_hours };
  }
  if (typeof input.is_suspicious === "boolean") {
    patch.is_suspicious = input.is_suspicious;
    changes.is_suspicious = { from: before.is_suspicious, to: input.is_suspicious };
  }

  if (Object.keys(patch).length === 0) {
    throw new HrApiError("Tidak ada field koreksi yang dikirim.", 400);
  }

  const updated = await adminPb.collection(ATTENDANCE_COLLECTION).update(recordId.trim(), patch);

  await emitBusinessEventServer(adminPb, {
    event_code: "hr.attendance.corrected",
    severity: "warning",
    module: "hr",
    entity_type: ATTENDANCE_COLLECTION,
    entity_id: recordId.trim(),
    entity_label: `attendance:${existing.date || ""}`,
    actor_id: ctx.userId,
    payload: {
      reason,
      target_user: targetUserId,
      date: existing.date,
      before,
      changes,
      actor_email: typeof ctx.user.email === "string" ? ctx.user.email : undefined,
    },
    dedupe_key: `hr.attendance.corrected:${recordId}:${Date.now()}`,
  });

  // Best-effort operational flags if correcting today's open/closed state
  try {
    const today = getTodayDate();
    if (String(existing.date || "") === today) {
      const after = updated as unknown as AttendanceRecord;
      if (after.check_in && !after.check_out) {
        await syncOperationalAccessAfterCheckIn(targetUserId);
      } else if (after.check_out || !after.check_in) {
        await syncOperationalAccessAfterCheckOut(targetUserId);
      }
    }
  } catch {
    /* non-fatal */
  }

  return {
    success: true,
    message: "Koreksi absensi disimpan.",
    data: updated as unknown as AttendanceRecord,
    id: updated.id,
  };
}
