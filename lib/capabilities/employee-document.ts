/**
 * Phase 34E — Private employee document capabilities.
 */

import { isHrAccount, isOwnerAccount, type AuthUserShape } from "@/lib/auth-model";

export const EMPLOYEE_DOCUMENT_CAPABILITIES = [
  "employee_document.view_self",
  "employee_document.upload_self",
  "employee_document.download_self",
  "employee_document.view_scoped",
  "employee_document.download_scoped",
] as const;

export type EmployeeDocumentCapability = (typeof EMPLOYEE_DOCUMENT_CAPABILITIES)[number];

export function resolveEmployeeDocumentCapabilities(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
): EmployeeDocumentCapability[] {
  if (!user) return [];
  const caps: EmployeeDocumentCapability[] = [
    "employee_document.view_self",
    "employee_document.upload_self",
    "employee_document.download_self",
  ];
  if (isOwnerAccount(user) || isHrAccount(user)) {
    caps.push("employee_document.view_scoped", "employee_document.download_scoped");
  }
  return caps;
}

export function hasEmployeeDocumentCapability(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
  cap: EmployeeDocumentCapability,
): boolean {
  return resolveEmployeeDocumentCapabilities(user).includes(cap);
}
