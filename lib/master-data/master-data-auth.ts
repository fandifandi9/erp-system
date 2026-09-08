import type { HrApiAuthContext } from "@/lib/hr/api-auth";
import { HrApiError } from "@/lib/hr/api-auth";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import {
  hasMasterDataCapability,
  type MasterDataCapability,
} from "@/lib/capabilities/master-data";

export function assertMasterDataCapability(
  ctx: HrApiAuthContext,
  cap: MasterDataCapability,
  message?: string,
): void {
  const legacy = hasMasterDataCapability(ctx.user, cap);
  if (!hasEffectiveCapability(ctx.user, ctx.accessContext, cap, legacy)) {
    throw new HrApiError(message || "Akses master data ditolak.", 403);
  }
}
