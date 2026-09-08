/**
 * Client-side normalization for GET /api/hr/attendance/today responses.
 */

export type TodayScheduleClient = {
  source?: string;
  startTime?: string | null;
  endTime?: string | null;
  isWorkingDay?: boolean;
  scheduleName?: string;
  timezone?: string;
};

export type TodayAttendanceClientPayload = {
  data: {
    check_in?: string;
    check_out?: string;
    status?: string;
  } | null;
  schedule: TodayScheduleClient | null;
  metrics?: { status?: string; lateMinutes?: number; overtimeMinutes?: number };
  office?: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    radius: number;
  } | null;
  require_checkin_selfie?: boolean;
};

export function parseTodayAttendanceResponse(json: unknown): TodayAttendanceClientPayload | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;

  const data =
    root.data && typeof root.data === "object"
      ? (root.data as TodayAttendanceClientPayload["data"])
      : null;

  const schedule =
    root.schedule && typeof root.schedule === "object"
      ? (root.schedule as TodayScheduleClient)
      : null;

  const metrics =
    root.metrics && typeof root.metrics === "object"
      ? (root.metrics as TodayAttendanceClientPayload["metrics"])
      : undefined;

  const officeRaw = root.office;
  let office: TodayAttendanceClientPayload["office"] = null;
  if (officeRaw && typeof officeRaw === "object") {
    const o = officeRaw as Record<string, unknown>;
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      office = {
        id: String(o.id ?? ""),
        name: String(o.name ?? ""),
        lat,
        lng,
        radius: Number(o.radius) || 100,
      };
    }
  }

  const selfieRaw = root.require_checkin_selfie;
  const require_checkin_selfie =
    selfieRaw === true ||
    String(selfieRaw).toLowerCase() === "true" ||
    Number(selfieRaw) === 1;

  return { data, schedule, metrics, office, require_checkin_selfie };
}

export function formatScheduleTimeRange(schedule: TodayScheduleClient | null | undefined): string | null {
  const start = schedule?.startTime;
  const end = schedule?.endTime;
  if (start && end) return `${start} – ${end}`;
  return null;
}
