/**
 * Server-side attendance mutations (Phase 11 / Wave 3 HR).
 * All writes use admin PocketBase after auth checks.
 */
import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import {
  calculateWorkHours,
  effectiveOfficeRadiusMeters,
  getTodayDate,
  profileRequiresCheckinSelfie,
  type AttendanceRecord,
  type Office,
  type Profile,
} from "@/lib/attendance";
import { enforceMaxGpsAccuracy, getDistance, validateGPSRadius } from "@/lib/gps";
import { FIELD_ACTIVITY_COLLECTION } from "@/lib/field_activity";
import {
  syncOperationalAccessAfterCheckInServer,
  syncOperationalAccessAfterCheckOutServer,
} from "@/lib/hr/operational-access-server";
import { resolveEmployeeDaySchedule } from "@/lib/hr/work-schedule-resolve";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { resolveAttendanceCompanyId, listUserIdsInCompanies } from "@/lib/hr/employment-scope";
import {
  assertAttendanceCapability,
  hasEffectiveAttendanceCapability,
} from "@/lib/hr/attendance-auth";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { listAllManagedEmployeeUserIds } from "@/lib/hr/employee-scope";
import {
  buildScheduleSnapshot,
  computeCheckInMetrics,
  computeFinalizedMetrics,
  computeWorkHoursFromIso,
  mapMetricsToPersistedFields,
  snapshotFromRecord,
} from "@/lib/hr/attendance-engine";
import { detectSuspiciousGPSJump } from "@/lib/device-fingerprint";
import { getBusinessDateYmd } from "@/lib/hr/business-date";

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

/** Approved Izin/Off (not field_activity) blocks check-in like leave. Pending does not. */
async function hasApprovedAbsenceTodayAdmin(adminPb: PocketBase, userId: string): Promise<boolean> {
  try {
    const { hasApprovedAbsenceOnDate } = await import("@/lib/hr/absence-request-server");
    return await hasApprovedAbsenceOnDate(adminPb, userId, getTodayDate());
  } catch {
    return false;
  }
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
  /** web = desktop/companion browser; mobile = native app (selfie wajib jika profil mengaktifkannya, semua channel) */
  client_channel?: "web" | "mobile";
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
  const uid = pbEscape(userId);
  const todayStr = getTodayDate();
  const dayStart = `${todayStr} 00:00:00.000Z`;
  const dayEnd = `${todayStr} 23:59:59.999Z`;
  const filters = [
    `user="${uid}" && date ~ "${todayStr}"`,
    `user="${uid}" && date >= "${dayStart}" && date <= "${dayEnd}"`,
    `user="${uid}" && date = "${todayStr}"`,
    `user="${uid}" && check_in >= "${dayStart}" && check_in <= "${dayEnd}"`,
  ];
  for (const filter of filters) {
    try {
      const result = await adminPb.collection(ATTENDANCE_COLLECTION).getList(1, 5, {
        filter,
        sort: "-created",
        requestKey: null,
      });
      if (!result.items.length) continue;
      const open = result.items.find((row) => {
        const rec = row as unknown as AttendanceRecord;
        return Boolean(rec.check_in) && !rec.check_out;
      });
      return (open || result.items[0]) as unknown as AttendanceRecord;
    } catch {
      /* try next filter */
    }
  }
  return null;
}

export async function getUserProfileAdmin(
  adminPb: PocketBase,
  userId: string,
): Promise<{ profile: Profile | null; office: Office | null }> {
  try {
    const profile = (await adminPb.collection("profiles").getFirstListItem(
      `user="${pbEscape(userId)}"`,
      { expand: "office_id", requestKey: null },
    )) as unknown as Profile & { expand?: { office_id?: Office }; office_id?: string };

    let office = (profile.expand?.office_id as Office | undefined) ?? null;
    // profiles.office_id is historically a text field (not relation) — expand is a no-op.
    if (!office) {
      const officeId = String(profile.office_id ?? "").trim();
      if (officeId) {
        try {
          office = (await adminPb.collection("offices").getOne(officeId, {
            requestKey: null,
          })) as unknown as Office;
        } catch {
          office = null;
        }
      }
    }
    return { profile, office };
  } catch {
    return { profile: null, office: null };
  }
}

/** HR administrative visibility — FOM-aware. Personal check-in does not use this. */
async function actorAttendanceCompanyIds(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<string[]> {
  if (ctx.isOwner) return ctx.companyIds;
  return getHrOperationalCompanyIds(adminPb, ctx);
}

/** HR/Owner/Manager: list attendance with capability + scope. */
export async function serverListAttendanceForHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    date?: string;
    userId?: string;
    status?: string;
    suspicious?: boolean;
    page?: number;
    perPage?: number;
  },
): Promise<{ items: AttendanceRecord[]; totalItems: number; totalPages: number }> {
  const canManage = hasEffectiveAttendanceCapability(ctx, "attendance.manage");
  const canTeam = hasEffectiveAttendanceCapability(ctx, "attendance.view_team");
  if (!canManage && !canTeam) {
    throw new HrApiError("Tidak berwenang melihat absensi tim.", 403);
  }

  const page = Math.max(1, input.page ?? 1);
  const perPage = Math.min(100, Math.max(1, input.perPage ?? 50));
  const filters: string[] = [];

  if (input.date?.trim()) {
    const d = input.date.trim().slice(0, 10);
    filters.push(`date = "${pbEscape(d)}"`);
  }
  if (input.status?.trim()) {
    filters.push(`status = "${pbEscape(input.status.trim())}"`);
  }
  if (input.suspicious) {
    filters.push(`is_suspicious = true`);
  }

  if (input.userId?.trim()) {
    const targetId = input.userId.trim();
    await assertCanViewUserAttendance(adminPb, ctx, targetId);
    filters.push(`user = "${pbEscape(targetId)}"`);
  } else {
    const scopeFilter = await buildAttendanceListScopeFilter(adminPb, ctx, canManage);
    if (scopeFilter) filters.push(scopeFilter);
  }

  const filter = filters.length ? filters.join(" && ") : "";
  const result = await adminPb.collection(ATTENDANCE_COLLECTION).getList(page, perPage, {
    filter,
    sort: "-date,-check_in",
    expand: "user,company_id",
    requestKey: null,
  });

  return {
    items: result.items as unknown as AttendanceRecord[],
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  };
}

async function assertCanViewUserAttendance(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
): Promise<void> {
  if (targetUserId === ctx.userId && hasEffectiveAttendanceCapability(ctx, "attendance.view_self")) {
    return;
  }
  if (hasEffectiveAttendanceCapability(ctx, "attendance.manage")) {
    if (ctx.isOwner) return;
    const effective = await actorAttendanceCompanyIds(adminPb, ctx);
    if (effective.length === 0) {
      throw new HrApiError("Scope entitas HR tidak dapat ditentukan.", 403);
    }
    const targetCompanies = await getAccessibleCompanyIds(adminPb, targetUserId);
    const overlap = targetCompanies.some((id) => effective.includes(id));
    if (!overlap) throw new HrApiError("Akses lintas entitas ditolak.", 403);
    return;
  }
  if (hasEffectiveAttendanceCapability(ctx, "attendance.view_team")) {
    const managed = await listAllManagedEmployeeUserIds(adminPb, ctx.userId);
    const effective = await actorAttendanceCompanyIds(adminPb, ctx);
    const companyUsers = new Set(
      effective.length > 0 ? await listUserIdsInCompanies(adminPb, effective) : managed,
    );
    if (!managed.includes(targetUserId) || !companyUsers.has(targetUserId)) {
      throw new HrApiError("Akses absensi tim ditolak.", 403);
    }
    return;
  }
  throw new HrApiError("Akses ditolak.", 403);
}

async function buildAttendanceListScopeFilter(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  canManage: boolean,
): Promise<string | null> {
  if (canManage && ctx.isOwner) return null;

  const effective = await actorAttendanceCompanyIds(adminPb, ctx);

  if (canManage) {
    if (effective.length === 0) {
      throw new HrApiError("Scope entitas HR tidak dapat ditentukan.", 403);
    }
    const parts = effective.map((c) => `company_id = "${pbEscape(c)}"`);
    return `(${parts.join(" || ")})`;
  }

  if (hasEffectiveAttendanceCapability(ctx, "attendance.view_team")) {
    const managed = await listAllManagedEmployeeUserIds(adminPb, ctx.userId);
    const companyUsers =
      effective.length > 0 ? new Set(await listUserIdsInCompanies(adminPb, effective)) : null;
    const visible = managed.filter((id) => !companyUsers || companyUsers.has(id));
    if (visible.length === 0) return 'user = ""';
    const chunk = visible.slice(0, 40).map((id) => `user = "${pbEscape(id)}"`).join(" || ");
    return `(${chunk})`;
  }

  throw new HrApiError("Scope absensi tidak dapat ditentukan.", 403);
}

export async function serverGetTodayAttendance(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<AttendanceRecord | null> {
  assertAttendanceCapability(ctx, "attendance.view_self");
  return getTodayAttendanceAdmin(adminPb, ctx.userId);
}

/** Authenticated employee: own attendance history only (no other users). */
export async function serverListOwnAttendance(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: { page?: number; perPage?: number } = {},
): Promise<{ items: AttendanceRecord[]; totalItems: number; totalPages: number }> {
  assertAttendanceCapability(ctx, "attendance.view_self");
  const page = Math.max(1, input.page ?? 1);
  const perPage = Math.min(50, Math.max(1, input.perPage ?? 30));
  const result = await adminPb.collection(ATTENDANCE_COLLECTION).getList(page, perPage, {
    filter: `user="${pbEscape(ctx.userId)}"`,
    sort: "-date,-check_in",
    requestKey: null,
  });
  return {
    items: result.items as unknown as AttendanceRecord[],
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  };
}

export async function serverCheckIn(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: ServerCheckInInput,
): Promise<AttendanceMutationResult> {
  assertAttendanceCapability(ctx, "attendance.check_in");
  const userId = ctx.userId;
  await assertUserActive(adminPb, userId);

  const channel = input.client_channel === "web" ? "web" : "mobile";
  void channel; // reserved for audit metadata
  const companyId = await resolveAttendanceCompanyId(adminPb, userId, ctx.user);

  const todayYmd = getBusinessDateYmd();
  const existing = await getTodayAttendanceAdmin(adminPb, userId);
  if (existing?.check_in && !existing.check_out) {
    return { success: false, message: "Sudah absen masuk hari ini. Absen pulang dulu." };
  }

  if (await hasApprovedLeaveTodayAdmin(adminPb, userId)) {
    return { success: false, message: "Anda sedang cuti disetujui hari ini." };
  }
  if (await hasApprovedAbsenceTodayAdmin(adminPb, userId)) {
    return { success: false, message: "Anda sedang Off disetujui hari ini." };
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
    if (!office) {
      return {
        success: false,
        message: "Pegawai belum ditugaskan ke kantor. Set kantor di data karyawan (HR).",
      };
    }
    if (office.is_active === false) {
      return { success: false, message: "Kantor pegawai tidak aktif. Hubungi HR." };
    }
    const officeLat = Number(office.lat);
    const officeLng = Number(office.lng);
    if (!Number.isFinite(officeLat) || !Number.isFinite(officeLng)) {
      return {
        success: false,
        message: "Koordinat kantor belum diisi. Lengkapi di Pengaturan → Kantor / Lokasi.",
      };
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
      officeLat,
      officeLng,
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
    const dist = Math.round(getDistance(lat, lng, Number(office.lat), Number(office.lng)));
    gpsValidation = {
      isValid: true,
      distance: dist,
      message: `Aktivitas luar disetujui — ~${dist} m dari kantor`,
    };
  }

  const daySchedule = await resolveEmployeeDaySchedule(adminPb, userId, todayYmd, profile);
  const now = new Date();
  const metrics = computeCheckInMetrics(daySchedule, now, todayYmd);
  const persisted = mapMetricsToPersistedFields(metrics);
  const snapshot = buildScheduleSnapshot(daySchedule);

  const createBody: Record<string, unknown> = {
    user: userId,
    company_id: companyId,
    date: todayYmd,
    check_in: now.toISOString(),
    status: persisted.status,
    late_minutes: persisted.late_minutes,
    early_leave_minutes: 0,
    overtime_minutes: 0,
    work_hours: 0,
    ...snapshot,
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

  // Phase 35I-M: server-side suspicious heuristics (never hardcode false-only).
  let isSuspicious = false;
  try {
    const recent = await adminPb.collection(ATTENDANCE_COLLECTION).getList(1, 3, {
      filter: `user="${pbEscape(userId)}" && id != ""`,
      sort: "-check_in",
      requestKey: null,
    });
    const prev = recent.items.find((row) => {
      const r = row as unknown as AttendanceRecord;
      return r.lat != null && r.lng != null && r.check_in;
    }) as unknown as AttendanceRecord | undefined;
    if (prev && lat != null && lng != null && prev.check_in) {
      const prevMs = new Date(String(prev.check_in)).getTime();
      const mins = Math.max(0, (now.getTime() - prevMs) / 60000);
      if (
        Number.isFinite(prev.lat) &&
        Number.isFinite(prev.lng) &&
        detectSuspiciousGPSJump(Number(prev.lat), Number(prev.lng), lat, lng, mins)
      ) {
        isSuspicious = true;
      }
    }
    if (
      prev?.device_id &&
      input.device_id?.trim() &&
      String(prev.device_id).trim() !== input.device_id.trim()
    ) {
      isSuspicious = true;
    }
  } catch {
    /* heuristic best-effort */
  }
  if (typeof accuracy === "number" && accuracy > 150 && accuracy <= 200) {
    // Borderline accuracy: allow punch but flag for HR review.
    isSuspicious = true;
  }
  createBody.is_suspicious = isSuspicious;

  let record;
  try {
    record = await adminPb.collection(ATTENDANCE_COLLECTION).create(createBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|constraint|duplicate|idx_attendance_one_day/i.test(msg)) {
      return {
        success: false,
        message: "Sudah absen masuk hari ini (duplikat dicegah).",
      };
    }
    throw e;
  }
  await syncOperationalAccessAfterCheckInServer(adminPb, userId).catch(() => undefined);

  return {
    success: true,
    message: `Absensi OK. ${gpsValidation.message}${isSuspicious ? " (ditandai perlu review GPS)." : ""}`,
    data: record as unknown as AttendanceRecord,
    id: record.id,
  };
}

export async function serverCheckOut(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<AttendanceMutationResult> {
  assertAttendanceCapability(ctx, "attendance.check_out");
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
  const snapshot = snapshotFromRecord(record as unknown as Record<string, unknown>);
  const finalized = computeFinalizedMetrics(
    snapshot,
    record.check_in,
    now.toISOString(),
    String(record.date || getTodayDate()).slice(0, 10),
  );
  const persisted = mapMetricsToPersistedFields(finalized);
  const workHours = computeWorkHoursFromIso(record.check_in, now.toISOString());

  const updated = await adminPb.collection(ATTENDANCE_COLLECTION).update(record.id, {
    check_out: now.toISOString(),
    work_hours: workHours,
    status: persisted.status,
    late_minutes: persisted.late_minutes,
    early_leave_minutes: persisted.early_leave_minutes,
    // Never auto-credit OT from late checkout — OT is approval/assignment workflow only.
    overtime_minutes: 0,
  });
  await syncOperationalAccessAfterCheckOutServer(adminPb, userId).catch(() => undefined);

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
    "early_leave_minutes",
    "overtime_minutes",
    "work_hours",
    "is_suspicious",
    "date",
    "company_id",
    "company",
    "schedule_source",
    "schedule_start",
    "schedule_end",
    "schedule_timezone",
    "schedule_assignment_id",
    "late_grace_minutes",
    "early_leave_grace_minutes",
    "is_working_day",
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
  assertAttendanceCapability(ctx, "attendance.manage", "Tidak berwenang mengoreksi absensi.");
  if (ctx.isOwner) return;
  const effective = await actorAttendanceCompanyIds(adminPb, ctx);
  if (effective.length === 0) {
    throw new HrApiError("Scope entitas HR tidak dapat ditentukan.", 403);
  }
  const subjectCompanies = await getAccessibleCompanyIds(adminPb, targetUserId);
  const overlap = subjectCompanies.some((id) => effective.includes(id));
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
        await syncOperationalAccessAfterCheckInServer(adminPb, targetUserId);
      } else if (after.check_out || !after.check_in) {
        await syncOperationalAccessAfterCheckOutServer(adminPb, targetUserId);
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
