/**
 * Phase 34E — Payslip capabilities.
 */

import { isHrAccount, isOwnerAccount, type AuthUserShape } from "@/lib/auth-model";

export const PAYSLIP_CAPABILITIES = [
  "payslip.view_self",
  "payslip.download_self",
  "payslip.view_scoped",
  "payslip.download_scoped",
  "payslip.manage",
] as const;

export type PayslipCapability = (typeof PAYSLIP_CAPABILITIES)[number];

export function resolvePayslipCapabilities(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
): PayslipCapability[] {
  if (!user) return [];
  const caps: PayslipCapability[] = ["payslip.view_self", "payslip.download_self"];
  if (isOwnerAccount(user)) {
    caps.push("payslip.view_scoped", "payslip.download_scoped", "payslip.manage");
    return [...new Set(caps)];
  }
  if (isHrAccount(user)) {
    caps.push("payslip.view_scoped", "payslip.download_scoped");
  }
  return caps;
}

export function hasPayslipCapability(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
  cap: PayslipCapability,
): boolean {
  return resolvePayslipCapabilities(user).includes(cap);
}
