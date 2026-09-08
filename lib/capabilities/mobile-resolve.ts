/**
 * lib/capabilities/mobile-resolve.ts
 * Phase 31 — Server-side mobile capability resolver (mirrors mobile/lib/capabilities.ts).
 * Used by Access Preview API; mobile app uses mobile/lib/capabilities.ts directly.
 */

import { normalizeAuthModel } from "@/lib/auth-model";
import { canAccessInventory, readInventoryRole } from "@/lib/inventory/access";

export const MOBILE_CAPABILITY_IDS = [
  "attendance.view",
  "attendance.view_self",
  "attendance.check_in",
  "attendance.check_out",
  "attendance.view_team",
  "attendance.manage",
  "leave.view_own",
  "leave.create",
  "leave.cancel_own",
  "leave.approve",
  "overtime.view_own",
  "overtime.create",
  "overtime.approve",
  "field_activity.view_own",
  "field_activity.create",
  "field_activity.approve",
  "report.view_own",
  "report.create",
  "report.view_all",
  "report.review",
  "report.close",
  "finding.view",
  "finding.create",
  "finding.manage",
  "rating.task_view",
  "rating.task_submit",
  "rating.result_view_own",
  "rating.manage",
  "hr.queue.leave",
  "hr.queue.overtime",
  "hr.queue.field_activity",
  "hr.staff.view",
  "inventory.view",
  "inventory.zone_scan",
  "inventory.product_scan",
  "inventory.packing",
  "inventory.opname",
  "inventory.movement_create",
  "wms.workstation_scan",
  "payroll.view_own",
  "profile.view_own",
  "profile.edit_own",
  "dashboard.work",
  "dashboard.operational",
  "employee.view_team",
  "schedule.view",
] as const;

export type MobileCapabilityId = (typeof MOBILE_CAPABILITY_IDS)[number];

type UserShape = Record<string, unknown> | null | undefined;

export function resolveMobileCapabilitiesServer(user: UserShape): Set<MobileCapabilityId> {
  const caps = new Set<MobileCapabilityId>();
  if (!user || typeof user !== "object") return caps;

  const auth = normalizeAuthModel(user);
  const isOwner = auth.accountType === "owner";
  const roleCode = auth.roleCode;
  const isHr = !isOwner && roleCode === "hr";
  const isManager = !isOwner && roleCode === "manager";
  const isHrOrOwner = isOwner || isHr;

  caps.add("profile.view_own");
  caps.add("profile.edit_own");
  caps.add("dashboard.work");
  caps.add("attendance.view");
  caps.add("attendance.check_in");
  caps.add("attendance.check_out");
  caps.add("attendance.view_self");
  caps.add("schedule.view");
  caps.add("leave.view_own");
  caps.add("leave.create");
  caps.add("leave.cancel_own");
  caps.add("overtime.view_own");
  caps.add("overtime.create");
  caps.add("field_activity.view_own");
  caps.add("field_activity.create");
  caps.add("payroll.view_own");
  caps.add("report.view_own");
  caps.add("report.create");
  caps.add("rating.task_view");
  caps.add("rating.task_submit");
  caps.add("rating.result_view_own");

  if (isHrOrOwner || auth.dashboardAccess) {
    caps.add("dashboard.operational");
  }

  if (isHrOrOwner) {
    caps.add("attendance.view_team");
    caps.add("attendance.manage");
    caps.add("leave.approve");
    caps.add("overtime.approve");
    caps.add("field_activity.approve");
    caps.add("report.view_all");
    caps.add("report.review");
    caps.add("report.close");
    caps.add("finding.view");
    caps.add("finding.create");
    caps.add("finding.manage");
    caps.add("rating.manage");
    caps.add("hr.queue.leave");
    caps.add("hr.queue.overtime");
    caps.add("hr.queue.field_activity");
    caps.add("hr.staff.view");
  }

  if (isOwner || isManager || isHr) {
    caps.add("employee.view_team");
  }
  if (isOwner || isManager) {
    caps.add("attendance.view_team");
  }

  if (canAccessInventory(user)) {
    caps.add("inventory.view");
    caps.add("inventory.zone_scan");
    caps.add("inventory.product_scan");
    caps.add("inventory.packing");
    caps.add("inventory.movement_create");
    caps.add("wms.workstation_scan");
    const invRole = readInventoryRole(user);
    if (isOwner || invRole === "supervisor" || invRole === "admin") {
      caps.add("inventory.opname");
    }
  }

  return caps;
}

export function listMobileCapabilitiesServer(user: UserShape): MobileCapabilityId[] {
  return [...resolveMobileCapabilitiesServer(user)];
}
