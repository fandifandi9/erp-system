/**
 * GET /api/access/self/effective — read-only effective access for authenticated user.
 * Foundation preview (Phase 35J will add Owner admin UI).
 */

import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { requireAuthenticatedHrUser, hrJsonError } from "@/lib/hr/api-auth";
import { loadUserAccessContext } from "@/lib/access/module-assignments-server";
import { resolveLegacyAllowedPaths } from "@/lib/access/legacy-paths";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const access = await loadUserAccessContext(adminPb, ctx.user);

    return NextResponse.json({
      ok: true,
      data: {
        userId: ctx.userId,
        legacyWebPaths: resolveLegacyAllowedPaths(ctx.user),
        moduleWebPaths: access.webPathPrefixes,
        capabilityKeys: [...access.capabilityKeys],
        assignments: access.assignments.map((a) => ({
          id: a.id,
          moduleId: a.moduleId,
          accessMode: a.accessMode,
          entityScopeMode: a.entityScopeMode,
          deskEnabled: a.deskEnabled,
          customPermissions: a.customPermissions,
          entityCompanyIds: a.entityCompanyIds,
        })),
        deskModuleIds: [...access.deskModuleIds],
        moduleEntityScope: Object.fromEntries(
          [...access.moduleEntityScope.entries()].map(([k, v]) => [
            k,
            { mode: v.mode, companyIds: v.companyIds },
          ]),
        ),
      },
    });
  } catch (err) {
    return hrJsonError(err);
  }
}
