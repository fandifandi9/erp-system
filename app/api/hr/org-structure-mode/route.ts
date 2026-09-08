import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  requireOwnerApiUser,
  requireOwnerOrHrApiUser,
} from "@/lib/hr/api-auth";
import {
  getOrganizationStructureModeState,
  setOrganizationStructureMode,
} from "@/lib/hr/org-structure-mode-server";
import { isOrgStructureMode } from "@/lib/hr/org-structure-mode";

/**
 * GET /api/hr/org-structure-mode
 * FLEX-ORG-04 — historical/compat read only. Global GROUP/COMPANY is obsolete.
 */
export async function GET(req: Request) {
  try {
    await requireOwnerOrHrApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const state = await getOrganizationStructureModeState(adminPb);
    return NextResponse.json({
      ok: true,
      data: {
        ...state,
        obsolete: true,
        message:
          "Global organization mode (GROUP/COMPANY) is obsolete. Use Management + FOM + position scope.",
      },
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

/**
 * PUT /api/hr/org-structure-mode — rejected (FLEX-ORG-04).
 */
export async function PUT(req: Request) {
  try {
    const ctx = await requireOwnerApiUser(req);
    const body = (await req.json().catch(() => ({}))) as { mode?: string };
    const mode = String(body.mode ?? "")
      .trim()
      .toUpperCase();
    if (mode && !isOrgStructureMode(mode)) {
      return NextResponse.json(
        { ok: false, error: "Mode tidak valid. Global GROUP/COMPANY telah dihapus." },
        { status: 400 },
      );
    }
    const adminPb = await getInventoryAdminPb();
    await setOrganizationStructureMode(adminPb, ctx, {
      mode: isOrgStructureMode(mode) ? mode : "GROUP",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
