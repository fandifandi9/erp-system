/**
 * Phase 34E — HR policy capabilities.
 */

import { isHrAccount, isOwnerAccount, type AuthUserShape } from "@/lib/auth-model";

export const HR_POLICY_CAPABILITIES = [
  "hr_policy.view_published",
  "hr_policy.manage",
] as const;

export type HrPolicyCapability = (typeof HR_POLICY_CAPABILITIES)[number];

export function resolveHrPolicyCapabilities(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
): HrPolicyCapability[] {
  if (!user) return [];
  const caps: HrPolicyCapability[] = ["hr_policy.view_published"];
  if (isOwnerAccount(user) || isHrAccount(user)) {
    caps.push("hr_policy.manage");
  }
  return caps;
}

export function hasHrPolicyCapability(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
  cap: HrPolicyCapability,
): boolean {
  return resolveHrPolicyCapabilities(user).includes(cap);
}
