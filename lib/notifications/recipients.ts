/**
 * lib/notifications/recipients.ts
 * Phase 24 — RBAC-based recipient resolution for notifications.
 *
 * Uses capability model from Phase 24A to determine who receives which notifications.
 * Role checks are based on existing account_type / role_code fields — not hard-coded
 * role strings except where they map 1:1 to a capability (leave.approve → hr OR owner).
 *
 * SECURITY: Server resolves recipients. Client never determines recipients.
 */

import type PocketBase from "pocketbase";

const PUSH_TOKENS_COLLECTION = "push_tokens";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Resolve users who have the `leave.approve` capability.
 * → account_type = "owner" OR role_code = "hr"
 * Optionally scoped by company (recommended for multi-tenant).
 */
export async function resolveLeaveApprovers(
  adminPb: PocketBase,
  options?: { companyIds?: string[] },
): Promise<string[]> {
  return resolveCapabilityHolders(adminPb, "leave.approve", options);
}

/**
 * Resolve users who have the `overtime.approve` capability.
 * → account_type = "owner" OR role_code = "hr"
 */
export async function resolveOvertimeApprovers(
  adminPb: PocketBase,
  options?: { companyIds?: string[] },
): Promise<string[]> {
  return resolveCapabilityHolders(adminPb, "overtime.approve", options);
}

/**
 * Resolve users who have the `field_activity.approve` capability.
 * → account_type = "owner" OR role_code = "hr"
 */
export async function resolveFieldActivityApprovers(
  adminPb: PocketBase,
  options?: { companyIds?: string[] },
): Promise<string[]> {
  return resolveCapabilityHolders(adminPb, "field_activity.approve", options);
}

/**
 * Resolve users who have the `report.review` capability.
 * → account_type = "owner" OR role_code = "hr"
 */
export async function resolveReportReviewers(
  adminPb: PocketBase,
  options?: { companyIds?: string[] },
): Promise<string[]> {
  return resolveCapabilityHolders(adminPb, "report.review", options);
}

/**
 * Generic capability-to-user resolver.
 *
 * Maps capabilities to PocketBase user field filters based on Phase 24A model:
 *   leave.approve / overtime.approve / field_activity.approve / report.review / ... →
 *     account_type = "owner" OR role_code = "hr"
 *
 * This is the ONLY place where capability → role_code mapping lives on the server.
 * If a future permission table is added, update this function — not the callers.
 */
export async function resolveCapabilityHolders(
  adminPb: PocketBase,
  capability: string,
  options?: { companyIds?: string[] },
): Promise<string[]> {
  // Capabilities that require HR/Owner privilege
  const HR_OWNER_CAPS = new Set([
    "leave.approve",
    "overtime.approve",
    "field_activity.approve",
    "report.view_all",
    "report.review",
    "report.close",
    "finding.view",
    "finding.create",
    "finding.manage",
    "rating.manage",
    "hr.queue.leave",
    "hr.queue.overtime",
    "hr.queue.field_activity",
    "payroll.bank.approve",
    "hr.staff.view",
    "employee.created",
    "employee.activated",
    "employee.deactivated",
    "employee.role_changed",
  ]);

  const MANAGER_CAPS = new Set(["leave.approve", "overtime.approve", "field_activity.approve"]);

  if (!HR_OWNER_CAPS.has(capability) && !MANAGER_CAPS.has(capability)) {
    // Universal capabilities (all users) — not useful as recipients for targeted notifications
    // Return empty for unsupported or universal caps
    console.warn(`[recipients] resolveCapabilityHolders: unsupported cap "${capability}"`);
    return [];
  }

  try {
    const filters: string[] = [];
    if (HR_OWNER_CAPS.has(capability)) {
      filters.push(`(account_type = "owner" || role_code = "hr")`);
    }
    if (MANAGER_CAPS.has(capability)) {
      filters.push(`role_code = "manager"`);
    }
    const statusFilter = `status != "inactive"`;
    const hrOwnerFilter =
      filters.length > 0
        ? `(${filters.join(" || ")}) && ${statusFilter}`
        : `${statusFilter}`;

    const records = await adminPb
      .collection("users")
      .getFullList<{ id: string; account_type: string; role_code: string }>({
        filter: hrOwnerFilter,
        fields: "id,account_type,role_code",
        requestKey: null,
      });

    let userIds = records.map((r) => r.id);

    // Company scope filtering (optional but recommended)
    if (options?.companyIds && options.companyIds.length > 0) {
      const companyIds = options.companyIds;
      try {
        // Get all users in the relevant companies via biz_user_companies
        const companyFilter = companyIds
          .map((id) => `company = "${pbEscape(id)}"`)
          .join(" || ");
        const memberships = await adminPb
          .collection("biz_user_companies")
          .getFullList<{ user: string; company: string }>({
            filter: `(${companyFilter}) && is_active != false`,
            fields: "user",
            requestKey: null,
          });
        const scopedUserIds = new Set(memberships.map((m) => m.user));

        // Owner accounts bypass company scope (they see all companies)
        const ownerIds = records
          .filter((r) => r.account_type === "owner")
          .map((r) => r.id);

        userIds = userIds.filter(
          (id) => scopedUserIds.has(id) || ownerIds.includes(id),
        );
      } catch (e) {
        console.warn("[recipients] company scope filter error:", e instanceof Error ? e.message : String(e));
        // Fall back to unscoped list (safer than blocking notifications entirely)
      }
    }

    return [...new Set(userIds)];
  } catch (e) {
    console.warn("[recipients] resolveCapabilityHolders error:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * Check whether a specific user has any active push tokens.
 * Used to avoid creating notifications for users with no devices.
 */
export async function userHasActivePushToken(
  adminPb: PocketBase,
  userId: string,
): Promise<boolean> {
  try {
    const records = await adminPb
      .collection(PUSH_TOKENS_COLLECTION)
      .getList(1, 1, {
        filter: `user = "${pbEscape(userId)}" && is_active = true`,
        requestKey: null,
      });
    return records.totalItems > 0;
  } catch {
    return false;
  }
}
