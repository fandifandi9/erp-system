/**
 * Phase 35I-B0 — Capability keys that must never be granted via module assignment (Owner-only).
 */

export const OWNER_ONLY_MODULE_CAPABILITY_KEYS = new Set([
  "employee.activate",
  "employee.deactivate",
  "employee.manage_hr_accounts",
]);

export function isOwnerOnlyModuleCapability(key: string): boolean {
  return OWNER_ONLY_MODULE_CAPABILITY_KEYS.has(key);
}
