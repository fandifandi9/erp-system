import { hasAnyCapability, hasCapability, type MobileCapability } from "@/lib/capabilities";

/** Owner & HR operational queues in native app — capability-driven (Phase 31). */
const HR_NATIVE_CAPS: MobileCapability[] = [
  "hr.queue.leave",
  "hr.queue.overtime",
  "hr.queue.field_activity",
  "leave.approve",
  "finding.view",
  "hr.staff.view",
];

export function canAccessHrNativeModule(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  return hasAnyCapability(user, HR_NATIVE_CAPS);
}

export { hasCapability };
