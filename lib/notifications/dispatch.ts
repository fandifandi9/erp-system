/**
 * lib/notifications/dispatch.ts
 * Phase 24 — Server-side notification dispatch.
 *
 * Creates a PocketBase notification record and optionally sends push.
 * ALWAYS fire-and-forget: dispatch failures never break the calling API route.
 *
 * SECURITY:
 * - Recipients are resolved server-side only.
 * - Client never determines who receives a notification.
 * - Notification payloads contain no sensitive data (generic text only).
 * - Deep links require re-authorization at the target screen.
 */

import type PocketBase from "pocketbase";
import { pushToUsers } from "@/lib/notifications/push";
import {
  NOTIFICATION_SAFE_TEXTS,
  type CreateNotificationInput,
  type NotificationType,
} from "@/lib/notifications/types";

const NOTIFICATIONS_COLLECTION = "notifications";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Create a single notification record for one recipient.
 * Checks idempotency_key to prevent duplicates.
 * Returns the created record ID or null on failure.
 */
async function createNotificationRecord(
  adminPb: PocketBase,
  input: CreateNotificationInput,
): Promise<string | null> {
  try {
    // Idempotency: skip if same key already exists
    if (input.idempotency_key) {
      const existing = await adminPb
        .collection(NOTIFICATIONS_COLLECTION)
        .getList(1, 1, {
          filter: `idempotency_key = "${pbEscape(input.idempotency_key)}"`,
          requestKey: null,
        });
      if (existing.totalItems > 0) {
        return existing.items[0]?.id ?? null;
      }
    }

    const record = await adminPb.collection(NOTIFICATIONS_COLLECTION).create({
      recipient: input.recipient,
      type: input.type,
      title: input.title,
      body: input.body,
      resource_type: input.resource_type ?? "",
      resource_id: input.resource_id ?? "",
      action: input.action ?? "",
      read_at: null,
      idempotency_key: input.idempotency_key ?? "",
    });
    return record.id;
  } catch (e) {
    console.warn(
      "[dispatch] createNotificationRecord error:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/**
 * Dispatch a notification to one or more recipients.
 *
 * Steps:
 *   1. Use safe (non-sensitive) text for the notification.
 *   2. Create a notification record per recipient (idempotency-checked).
 *   3. Send Expo push notification to active device tokens (fire-and-forget).
 *
 * Never throws — dispatch is best-effort.
 */
export async function dispatchNotification(
  adminPb: PocketBase,
  input: {
    recipientIds: string[];
    type: NotificationType;
    resource_type?: string;
    resource_id?: string;
    action?: string;
    /** Override for safe texts if needed (still must not contain sensitive data). */
    title?: string;
    body?: string;
    /** Suffix for idempotency key (e.g. resource_id). */
    idempotencyKeySuffix?: string;
  },
): Promise<void> {
  const { recipientIds, type } = input;
  if (!recipientIds || recipientIds.length === 0) return;

  const safeText = NOTIFICATION_SAFE_TEXTS[type] ?? {
    title: "Notifikasi Baru",
    body: "Ada aktivitas baru dalam sistem.",
  };
  const title = input.title ?? safeText.title;
  const body = input.body ?? safeText.body;

  // Create notification records (async, fire-and-forget)
  const createdUserIds: string[] = [];
  for (const recipientId of recipientIds) {
    const key = input.idempotencyKeySuffix
      ? `${type}:${input.idempotencyKeySuffix}:${recipientId}`
      : "";
    const notifId = await createNotificationRecord(adminPb, {
      recipient: recipientId,
      type,
      title,
      body,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      action: input.action,
      idempotency_key: key || undefined,
    });
    if (notifId) createdUserIds.push(recipientId);
  }

  // Send push notifications (fire-and-forget)
  if (createdUserIds.length > 0) {
    await pushToUsers(adminPb, createdUserIds, {
      title,
      body,
      data: {
        type,
        resource_type: input.resource_type ?? "",
        resource_id: input.resource_id ?? "",
        action: input.action ?? "",
      },
    });
  }
}

/**
 * Convenience: dispatch a "leave.created" notification to approvers.
 * All params are resource IDs — no sensitive content included.
 */
export async function notifyLeaveCreated(
  adminPb: PocketBase,
  opts: { approverIds: string[]; leaveRequestId: string },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: opts.approverIds,
    type: "leave.created",
    resource_type: "leave_requests",
    resource_id: opts.leaveRequestId,
    action: "/leave",
    idempotencyKeySuffix: opts.leaveRequestId,
  });
}

export async function notifyLeaveDecision(
  adminPb: PocketBase,
  opts: {
    requesterId: string;
    leaveRequestId: string;
    decision: "approved" | "rejected";
  },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: [opts.requesterId],
    type: opts.decision === "approved" ? "leave.approved" : "leave.rejected",
    resource_type: "leave_requests",
    resource_id: opts.leaveRequestId,
    action: "/leave",
    idempotencyKeySuffix: `${opts.decision}:${opts.leaveRequestId}`,
  });
}

export async function notifyOvertimeCreated(
  adminPb: PocketBase,
  opts: { approverIds: string[]; overtimeRequestId: string },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: opts.approverIds,
    type: "overtime.created",
    resource_type: "overtime_requests",
    resource_id: opts.overtimeRequestId,
    action: "/overtime",
    idempotencyKeySuffix: opts.overtimeRequestId,
  });
}

export async function notifyOvertimeDecision(
  adminPb: PocketBase,
  opts: {
    requesterId: string;
    overtimeRequestId: string;
    decision: "approved" | "rejected";
  },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: [opts.requesterId],
    type: opts.decision === "approved" ? "overtime.approved" : "overtime.rejected",
    resource_type: "overtime_requests",
    resource_id: opts.overtimeRequestId,
    action: "/overtime",
    idempotencyKeySuffix: `${opts.decision}:${opts.overtimeRequestId}`,
  });
}

export async function notifyReportCreated(
  adminPb: PocketBase,
  opts: { reviewerIds: string[]; reportId: string },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: opts.reviewerIds,
    type: "report.created",
    resource_type: "hr_staff_reports",
    resource_id: opts.reportId,
    action: "/reports",
    idempotencyKeySuffix: opts.reportId,
  });
}

export async function notifyRatingTaskAssigned(
  adminPb: PocketBase,
  opts: { reviewerIds: string[]; periodId: string },
): Promise<void> {
  await dispatchNotification(adminPb, {
    recipientIds: opts.reviewerIds,
    type: "rating.task_assigned",
    resource_type: "hr_rating_periods",
    resource_id: opts.periodId,
    action: "/rating",
    idempotencyKeySuffix: opts.periodId,
  });
}
