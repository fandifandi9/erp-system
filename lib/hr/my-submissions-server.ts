/**
 * Phase 35I-M / NEXT — unified personal submissions
 * (leave + overtime + field activity + izin/off).
 */

import type PocketBase from "pocketbase";
import type { HrApiAuthContext } from "@/lib/hr/api-auth";
import { FIELD_ACTIVITY_COLLECTION } from "@/lib/field_activity";
import { ABSENCE_REQUESTS_COLLECTION } from "@/lib/hr/absence-request-server";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type MySubmissionItem = {
  id: string;
  kind: "leave" | "overtime" | "field_activity" | "izin_off";
  status: string;
  title: string;
  dateLabel: string;
  created?: string;
  rejectionReason?: string;
  approverName?: string;
};

export async function serverListMySubmissions(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<MySubmissionItem[]> {
  const uid = pbEscape(ctx.userId);
  const out: MySubmissionItem[] = [];

  try {
    const leaves = await adminPb.collection("leave_requests").getFullList({
      filter: `user="${uid}"`,
      sort: "-created",
      requestKey: null,
    });
    for (const raw of leaves) {
      const r = raw as Record<string, unknown>;
      const start = String(r.start_date ?? r.booking_date ?? r.date ?? "").slice(0, 10);
      out.push({
        id: String(r.id),
        kind: "leave",
        status: String(r.status ?? ""),
        title: "Cuti",
        dateLabel: start,
        created: String(r.created ?? ""),
        rejectionReason: String(r.rejection_reason ?? "").trim() || undefined,
        approverName: String(r.hr_action_name ?? "").trim() || undefined,
      });
    }
  } catch {
    /* collection/rules */
  }

  try {
    const ots = await adminPb.collection("overtime_requests").getFullList({
      filter: `user="${uid}"`,
      sort: "-created",
      requestKey: null,
    });
    for (const raw of ots) {
      const r = raw as Record<string, unknown>;
      out.push({
        id: String(r.id),
        kind: "overtime",
        status: String(r.status ?? ""),
        title: "Lembur",
        dateLabel: String(r.work_date ?? "").slice(0, 10),
        created: String(r.created ?? ""),
        rejectionReason: String(r.rejection_reason ?? "").trim() || undefined,
        approverName: String(r.hr_action_name ?? "").trim() || undefined,
      });
    }
  } catch {
    /* */
  }

  try {
    const fields = await adminPb.collection(FIELD_ACTIVITY_COLLECTION).getFullList({
      filter: `user="${uid}"`,
      sort: "-created",
      requestKey: null,
    });
    for (const raw of fields) {
      const r = raw as Record<string, unknown>;
      out.push({
        id: String(r.id),
        kind: "field_activity",
        status: String(r.status ?? ""),
        title: "Luar kantor",
        dateLabel: String(r.start_date ?? "").slice(0, 10),
        created: String(r.created ?? ""),
        rejectionReason: String(r.rejection_reason ?? "").trim() || undefined,
        approverName: String(r.hr_action_name ?? "").trim() || undefined,
      });
    }
  } catch {
    /* */
  }

  try {
    const absences = await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getFullList({
      filter: `user="${uid}"`,
      sort: "-created",
      requestKey: null,
    });
    for (const raw of absences) {
      const r = raw as Record<string, unknown>;
      const typ = String(r.type ?? "izin");
      out.push({
        id: String(r.id),
        kind: "izin_off",
        status: String(r.status ?? ""),
        title: typ === "off" ? "Off" : "Absen",
        dateLabel: String(r.start_date ?? "").slice(0, 10),
        created: String(r.created ?? ""),
        rejectionReason: String(r.rejection_reason ?? "").trim() || undefined,
        approverName: String(r.hr_action_name ?? "").trim() || undefined,
      });
    }
  } catch {
    /* */
  }

  out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return out;
}
