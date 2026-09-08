/**
 * Phase 35I — Server-side authorization assertions for module access SSOT.
 */

import { readAccessContextFromUser } from "@/lib/access/context";
import { assertCompanyAllowedForModule, ModuleEntityScopeError } from "@/lib/access/entity-scope";
import { hasModuleCapability } from "@/lib/access/resolve-effective-access";
import type { ModuleId, PermissionKey, UserAccessContext } from "@/lib/access/types";
import { canAccess } from "@/lib/rbac";

export class ModuleAccessError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ModuleAccessError";
  }
}

export function assertModuleCapability(
  context: UserAccessContext | null | undefined,
  capabilityKey: PermissionKey,
  message?: string,
): void {
  if (!hasModuleCapability(context, capabilityKey)) {
    throw new ModuleAccessError(message || `Akses ditolak: ${capabilityKey}`);
  }
}

export function assertModuleWebRoute(
  user: Record<string, unknown> | null | undefined,
  pathname: string,
  message?: string,
): void {
  if (!user || !canAccess(user, pathname)) {
    throw new ModuleAccessError(message || "Akses route ditolak.");
  }
}

export function assertModuleEntityAccess(
  context: UserAccessContext | null | undefined,
  moduleId: ModuleId,
  companyId: string | null | undefined,
  message?: string,
): void {
  const scope = context?.moduleEntityScope.get(moduleId);
  try {
    assertCompanyAllowedForModule(scope, companyId, message);
  } catch (e) {
    if (e instanceof ModuleEntityScopeError) {
      throw new ModuleAccessError(e.message);
    }
    throw e;
  }
}

export function getAccessContextOrNull(
  user: Record<string, unknown> | null | undefined,
): UserAccessContext | null {
  return readAccessContextFromUser(user);
}
