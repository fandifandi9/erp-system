/**
 * lib/notifications/types.ts
 * Phase 24 — Shared notification types.
 *
 * SECURITY: Notifications are UI/UX layer only.
 * Payload must NOT contain sensitive data. All resource access requires
 * re-authorization at the target API/screen.
 */

// ─── Notification event types ─────────────────────────────────────────────────

export type NotificationType =
  // Leave
  | "leave.created"       // staff submitted leave → notify approvers
  | "leave.approved"      // HR/Owner approved → notify requester
  | "leave.rejected"      // HR/Owner rejected → notify requester
  | "leave.cancelled"     // staff cancelled → notify approvers (optional)
  // Overtime
  | "overtime.created"    // staff submitted overtime → notify approvers
  | "overtime.approved"   // approved → notify requester
  | "overtime.rejected"   // rejected → notify requester
  // Field Activity
  | "field_activity.created"   // submitted → notify approvers
  | "field_activity.approved"  // approved → notify requester
  | "field_activity.rejected"  // rejected → notify requester
  // Staff Reports
  | "report.created"      // submitted → notify HR reviewers
  | "report.closed"       // closed → notify report author
  // Findings
  | "finding.created"     // recorded → notify HR (same user typically; future: notify relevant staff)
  // Rating
  | "rating.task_assigned" // reviewer assigned → notify reviewer
  // HR Phase 34E
  | "hr.policy.published"
  | "hr.policy.updated"
  | "hr.attendance_policy.published"
  | "hr.holiday.created"
  | "hr.holiday.updated"
  | "payslip.available"
  | "employee_document.verified"
  | "employee_document.rejected"
  // Future
  | "system.test";        // internal test notification

// ─── Notification record (mirrors PocketBase schema) ─────────────────────────

export type NotificationRecord = {
  id: string;
  recipient: string;       // user id
  type: NotificationType;
  title: string;
  body: string;
  resource_type: string;   // e.g. "leave_requests"
  resource_id: string;     // PocketBase record ID
  action: string;          // deep link path e.g. "/leave"
  read_at: string | null;  // ISO date or null (unread)
  idempotency_key: string;
  created: string;
  updated: string;
};

// ─── Create input ────────────────────────────────────────────────────────────

export type CreateNotificationInput = {
  recipient: string;
  type: NotificationType;
  title: string;
  body: string;
  resource_type?: string;
  resource_id?: string;
  action?: string;
  /** Optional key to prevent duplicate notifications for the same event. */
  idempotency_key?: string;
};

// ─── Push token record ───────────────────────────────────────────────────────

export type PushTokenRecord = {
  id: string;
  user: string;
  token: string;
  platform: "android" | "ios";
  device_id: string;
  is_active: boolean;
  last_seen: string;
};

// ─── Expo push message ───────────────────────────────────────────────────────

export type ExpoPushMessage = {
  to: string;          // "ExponentPushToken[...]"
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
};

export type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

// ─── Notification privacy: safe payload ─────────────────────────────────────

/**
 * Generic notification texts that don't leak sensitive content.
 * Detail is revealed only after the user opens the resource (with re-auth).
 */
export const NOTIFICATION_SAFE_TEXTS: Record<
  NotificationType,
  { title: string; body: string }
> = {
  "leave.created":           { title: "Pengajuan Cuti Baru",         body: "Ada pengajuan cuti yang memerlukan persetujuan Anda." },
  "leave.approved":          { title: "Cuti Disetujui",              body: "Pengajuan cuti Anda telah disetujui." },
  "leave.rejected":          { title: "Cuti Ditolak",                body: "Pengajuan cuti Anda tidak disetujui. Buka detail untuk informasi lengkap." },
  "leave.cancelled":         { title: "Pengajuan Cuti Dibatalkan",   body: "Sebuah pengajuan cuti telah dibatalkan." },
  "overtime.created":        { title: "Pengajuan Lembur Baru",       body: "Ada pengajuan lembur yang memerlukan persetujuan Anda." },
  "overtime.approved":       { title: "Lembur Disetujui",            body: "Pengajuan lembur Anda telah disetujui." },
  "overtime.rejected":       { title: "Lembur Ditolak",              body: "Pengajuan lembur Anda tidak disetujui." },
  "field_activity.created":  { title: "Aktivitas Luar Kantor Baru",  body: "Ada aktivitas luar kantor yang memerlukan persetujuan Anda." },
  "field_activity.approved": { title: "Aktivitas Disetujui",         body: "Aktivitas luar kantor Anda telah disetujui." },
  "field_activity.rejected": { title: "Aktivitas Ditolak",           body: "Aktivitas luar kantor Anda tidak disetujui." },
  "report.created":          { title: "Laporan Baru Masuk",          body: "Ada laporan staf baru yang perlu ditinjau." },
  "report.closed":           { title: "Laporan Ditutup",             body: "Laporan Anda telah diproses. Buka detail untuk informasi." },
  "finding.created":         { title: "Temuan HR Dicatat",           body: "Temuan HR baru telah dicatat." },
  "rating.task_assigned":    { title: "Tugas Penilaian Baru",        body: "Anda mendapat tugas penilaian baru. Buka tab Rating untuk melihat." },
  "hr.policy.published":     { title: "Kebijakan HR Baru",           body: "Kebijakan kepegawaian baru telah dipublikasikan." },
  "hr.policy.updated":       { title: "Kebijakan HR Diperbarui",     body: "Kebijakan kepegawaian telah diperbarui." },
  "hr.attendance_policy.published": { title: "Kebijakan Absensi Diperbarui", body: "Tarif potongan keterlambatan/ketidakhadiran telah diperbarui." },
  "hr.holiday.created":      { title: "Hari Libur Baru",             body: "Jadwal hari libur perusahaan telah diperbarui." },
  "hr.holiday.updated":      { title: "Hari Libur Diperbarui",       body: "Informasi hari libur telah diperbarui." },
  "payslip.available":       { title: "Slip Gaji Tersedia",          body: "Slip gaji baru sudah dapat diakses." },
  "employee_document.verified": { title: "Dokumen Diverifikasi",     body: "Dokumen pribadi Anda telah diverifikasi." },
  "employee_document.rejected": { title: "Dokumen Perlu Diperbaiki", body: "Dokumen pribadi perlu diunggah ulang." },
  "system.test":             { title: "Notifikasi Test",             body: "Ini adalah notifikasi pengujian sistem." },
};
