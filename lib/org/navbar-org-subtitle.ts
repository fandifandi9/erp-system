/**
 * Display label under navbar name: jabatan struktur organisasi (SSOT),
 * not legacy users.role / role_code (e.g. "Manager").
 */

import { isOwnerAccount } from "@/lib/auth-model";
import {
  readActiveWorkspaceDomainFromUser,
  SESSION_ACTIVE_ORG_POSITION_NAME_FIELD,
} from "@/lib/org/resolve-primary-workspace";
import { WORKSPACE_DOMAIN_LABELS } from "@/lib/org/workspace-domain";

export function resolveNavbarOrgSubtitle(
  user: Record<string, unknown> | null | undefined,
): string {
  if (!user) return "";
  if (isOwnerAccount(user)) return "Owner";

  const positionName = String(user[SESSION_ACTIVE_ORG_POSITION_NAME_FIELD] ?? "").trim();
  if (positionName) return positionName;

  const domain = readActiveWorkspaceDomainFromUser(user);
  if (domain) return WORKSPACE_DOMAIN_LABELS[domain];

  return "";
}
