/**
 * Phase 34C — System Master Data capabilities (Legal Entity layer).
 * Modules (HR, Attendance, Accounting, …) consume master data; they do not own it.
 */

import { isHrAccount, isOwnerAccount, type AuthUserShape } from "@/lib/auth-model";

export const MASTER_DATA_CAPABILITIES = [
  "master_data.entity.view",
  "master_data.entity.manage",
  "master_data.membership.assign",
] as const;

export type MasterDataCapability = (typeof MASTER_DATA_CAPABILITIES)[number];

const OWNER_CAPS: Set<MasterDataCapability> = new Set([
  "master_data.entity.view",
  "master_data.entity.manage",
  "master_data.membership.assign",
]);

const HR_CAPS: Set<MasterDataCapability> = new Set([
  "master_data.entity.view",
  "master_data.membership.assign",
]);

export function resolveMasterDataCapabilities(user: AuthUserShape | Record<string, unknown> | null | undefined): MasterDataCapability[] {
  if (!user) return [];
  if (isOwnerAccount(user)) return [...MASTER_DATA_CAPABILITIES];
  if (isHrAccount(user)) return [...HR_CAPS];
  return [];
}

export function hasMasterDataCapability(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
  cap: MasterDataCapability,
): boolean {
  return resolveMasterDataCapabilities(user).includes(cap);
}
