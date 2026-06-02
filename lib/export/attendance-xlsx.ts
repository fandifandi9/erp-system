import { buildAndDownloadXlsx, type XlsxColumnDef } from "@/lib/export/xlsx";

export type AttendanceExportRow = {
  user_name: string;
  date: string | Date;
  check_in?: string | Date | null;
  has_selfie: string;
  check_out?: string | Date | null;
  status: string;
  late_minutes: number;
  work_hours: number;
  distance_meter: number | string;
  is_suspicious: string;
};

type AttendanceRowKey =
  | "user_name"
  | "date"
  | "check_in"
  | "has_selfie"
  | "check_out"
  | "status"
  | "late_minutes"
  | "work_hours"
  | "distance_meter"
  | "is_suspicious";

const ATTENDANCE_COLUMNS: XlsxColumnDef<AttendanceRowKey>[] = [
  { header: "Nama", key: "user_name", width: 26, type: "text" },
  { header: "Tanggal", key: "date", width: 14, type: "date" },
  { header: "Check In", key: "check_in", width: 18, type: "datetime" },
  { header: "Selfie", key: "has_selfie", width: 10, type: "text" },
  { header: "Check Out", key: "check_out", width: 18, type: "datetime" },
  { header: "Status", key: "status", width: 14, type: "text" },
  { header: "Terlambat (menit)", key: "late_minutes", width: 16, type: "integer" },
  { header: "Jam Kerja", key: "work_hours", width: 12, type: "number" },
  { header: "Jarak (m)", key: "distance_meter", width: 12, type: "number" },
  { header: "Mencurigakan", key: "is_suspicious", width: 14, type: "text" },
];

export async function downloadAttendanceXlsx(
  rows: AttendanceExportRow[],
  filename?: string
): Promise<void> {
  const stamp = new Date().toISOString().split("T")[0];
  await buildAndDownloadXlsx({
    sheetName: "Absensi",
    filename: filename ?? `attendance_${stamp}.xlsx`,
    columns: ATTENDANCE_COLUMNS,
    rows: rows as Array<Record<AttendanceRowKey, unknown>>,
  });
}
