/**
 * Pengajuan aktivitas luar kantor (meeting, kunjungan, dinas luar, dll.)
 * — harus **disetujui HR** sebelum tanggal aktivitas dipakai untuk bypass zona absensi.
 * Koleksi PocketBase: `field_activity_requests`
 */

import { pb } from "./pocketbase";
import { getErrorMessage } from "./errors";
import {
  HR_ACTION_AT_FIELD,
  HR_ACTION_BY_FIELD,
  HR_ACTION_NAME_FIELD,
} from "./leave";

export const FIELD_ACTIVITY_COLLECTION = "field_activity_requests";

export type FieldActivityType = "meeting" | "visit" | "out_of_town" | "other";

export type FieldActivityStatus = "pending_hr" | "approved" | "rejected" | "cancelled";

export interface FieldActivityRequest {
  id: string;
  user: string;
  start_date: string;
  end_date: string;
  activity_type: FieldActivityType;
  destination: string;
  reason: string;
  status: FieldActivityStatus;
  rejection_reason?: string;
  hr_action_by?: string;
  hr_action_name?: string;
  hr_action_at?: string;
  created: string;
  updated: string;
}

export const ACTIVITY_TYPE_LABEL: Record<FieldActivityType, string> = {
  meeting: "Rapat / meeting",
  visit: "Kunjungan",
  out_of_town: "Dinas luar kota",
  other: "Lainnya",
};

function pbEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function ymdOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  return s.slice(0, 10);
}

function userIdFromRecord(raw: { user?: unknown }): string {
  const u = raw.user;
  if (u && typeof u === "object" && u !== null && "id" in u) {
    return String((u as { id: string }).id);
  }
  return String(u ?? "");
}

function hrActionPayload(): Record<string, string> {
  const m = pb.authStore.model as { id?: string; name?: string; email?: string } | null;
  if (!m?.id) return {};
  const id = String(m.id);
  const name = String(m.name ?? m.email ?? "").trim();
  return {
    [HR_ACTION_BY_FIELD]: id,
    [HR_ACTION_NAME_FIELD]: name || id,
    [HR_ACTION_AT_FIELD]: new Date().toISOString(),
  };
}

export function normalizeFieldActivityRows(items: unknown[]): FieldActivityRequest[] {
  return items.map((row) => {
    const raw = row as Record<string, unknown>;
    const st = String(raw.status ?? "pending_hr") as FieldActivityStatus;
    const at = String(raw.activity_type ?? "other") as FieldActivityType;
    const typeOk: FieldActivityType = ["meeting", "visit", "out_of_town", "other"].includes(at)
      ? at
      : "other";
    return {
      id: String(raw.id ?? ""),
      user: userIdFromRecord(raw as { user?: unknown }),
      start_date: ymdOnly(raw.start_date),
      end_date: ymdOnly(raw.end_date),
      activity_type: typeOk,
      destination: String(raw.destination ?? "").trim(),
      reason: String(raw.reason ?? "").trim(),
      status: st,
      rejection_reason: String(raw.rejection_reason ?? "").trim() || undefined,
      hr_action_by: String(raw[HR_ACTION_BY_FIELD] ?? raw.hr_action_by ?? "").trim() || undefined,
      hr_action_name: String(raw[HR_ACTION_NAME_FIELD] ?? raw.hr_action_name ?? "").trim() || undefined,
      hr_action_at: String(raw[HR_ACTION_AT_FIELD] ?? raw.hr_action_at ?? "").trim() || undefined,
      created: String(raw.created ?? ""),
      updated: String(raw.updated ?? ""),
    };
  });
}

/**
 * true jika user punya pengajuan **disetujui** yang mencakup tanggal kalender `ymd` (yyyy-MM-dd).
 * Dipakai saat check-in: boleh di luar radius kantor.
 */
export async function userHasApprovedFieldActivityForDate(
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
      const rows = normalizeFieldActivityRows(all as unknown[]);
      return rows.some((r) => r.start_date <= ymd && r.end_date >= ymd);
    } catch {
      return false;
    }
  }
}

export async function fetchFieldActivityForUser(userId: string): Promise<FieldActivityRequest[]> {
  if (!userId?.trim()) return [];
  const list = await pb.collection(FIELD_ACTIVITY_COLLECTION).getFullList({
    filter: `user="${pbEsc(userId)}"`,
    sort: "-created",
    requestKey: null,
  });
  return normalizeFieldActivityRows(list as unknown[]);
}

export async function fetchFieldActivityForHr(): Promise<FieldActivityRequest[]> {
  // FLEX-ORG-05-FIX — use scoped server API (no unscoped getFullList).
  const { mobileFetchFieldQueue } = await import("@/lib/hr-queue-api");
  const res = await mobileFetchFieldQueue();
  if (!res.ok) throw new Error(res.error || "Gagal memuat antrian field activity.");
  return normalizeFieldActivityRows(res.items);
}

export async function createFieldActivityRequest(input: {
  start_date: string;
  end_date: string;
  activity_type: FieldActivityType;
  destination: string;
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  const uid = pb.authStore.model?.id;
  if (!uid) return { success: false, message: "Silakan login." };

  const sd = ymdOnly(input.start_date);
  const ed = ymdOnly(input.end_date);
  if (!sd || !ed) return { success: false, message: "Tanggal tidak valid." };
  if (ed < sd) return { success: false, message: "Tanggal selesai tidak boleh sebelum tanggal mulai." };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (ed < todayStr) {
    return { success: false, message: "Periode tidak boleh seluruhnya di masa lalu." };
  }

  const dest = input.destination.trim();
  const reason = input.reason.trim();
  if (dest.length < 2) return { success: false, message: "Isi tujuan / lokasi (min. 2 karakter)." };
  if (reason.length < 10) return { success: false, message: "Jelaskan keperluan aktivitas (min. 10 karakter)." };

  try {
    const { mobileSubmitFieldActivity } = await import("@/lib/hr-field-api");
    const res = await mobileSubmitFieldActivity({
      start_date: sd,
      end_date: ed,
      activity_type: input.activity_type,
      destination: dest,
      reason,
    });
    if (!res.success) return res;
    return {
      success: true,
      message:
        "Pengajuan terkirim. Setelah disetujui, Anda dapat absen masuk di luar zona kantor pada tanggal yang diajukan.",
    };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal menyimpan pengajuan.") };
  }
}

export async function hrApproveFieldActivity(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const { mobileApproveFieldActivity } = await import("@/lib/hr-field-api");
    const res = await mobileApproveFieldActivity(id);
    if (!res.success) return res;
    return {
      success: true,
      message: "Aktivitas luar disetujui. Staff dapat absensi di luar radius pada tanggal tersebut.",
    };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal menyetujui.") };
  }
}

export async function hrRejectFieldActivity(
  id: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const r = String(reason ?? "").trim();
  if (r.length < 5) return { success: false, message: "Alasan penolakan minimal 5 karakter." };
  try {
    const { mobileRejectFieldActivity } = await import("@/lib/hr-field-api");
    const res = await mobileRejectFieldActivity(id, r);
    if (!res.success) return res;
    return { success: true, message: "Pengajuan ditolak." };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal menolak.") };
  }
}

export async function staffCancelPending(id: string): Promise<{ success: boolean; message: string }> {
  const uid = pb.authStore.model?.id;
  if (!uid) return { success: false, message: "Silakan login." };
  try {
    const rec = await pb.collection(FIELD_ACTIVITY_COLLECTION).getOne(id);
    const raw = rec as unknown as Record<string, unknown>;
    if (userIdFromRecord(raw as { user?: unknown }) !== uid) {
      return { success: false, message: "Bukan pengajuan Anda." };
    }
    if (String(raw.status) !== "pending_hr") {
      return { success: false, message: "Hanya pengajuan menunggu HR yang dapat dibatalkan." };
    }
    await pb.collection(FIELD_ACTIVITY_COLLECTION).update(id, { status: "cancelled" });
    return { success: true, message: "Pengajuan dibatalkan." };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal membatalkan.") };
  }
}

export function formatFieldActivityHrSummary(row: FieldActivityRequest): string | null {
  const name = row.hr_action_name?.trim();
  const at = row.hr_action_at?.trim();
  if (!name && !at) return null;
  const parts: string[] = [];
  if (name) parts.push(name);
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        d.toLocaleString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
  }
  return parts.length ? parts.join(" · ") : null;
}
