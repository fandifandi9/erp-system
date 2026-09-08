import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { buildWorkstationQrPayload } from "@/lib/wms/workstation-qr";
import {
  getLockedDeskCodeSet,
  getWorkstationConfigSummary,
  isDeskCheckInGloballyEnabled,
  isDeskCodeLocked,
} from "@/lib/wms/workstation-config";
import { DEFAULT_WMS_WORKSTATIONS, workstationFromRow } from "@/lib/wms/workstations";

export async function GET() {
  const summary = getWorkstationConfigSummary();
  let desks = DEFAULT_WMS_WORKSTATIONS;

  try {
    const adminPb = await getInventoryAdminPb();
    const rows = await adminPb.collection("wms_workstations").getFullList({
      sort: "code",
      requestKey: null,
    });
    if (rows.length > 0) {
      desks = rows.map((r) => workstationFromRow(r as Record<string, unknown>));
    }
  } catch {
    /* default */
  }

  const locked = getLockedDeskCodeSet();
  const globalOff = !isDeskCheckInGloballyEnabled();

  return NextResponse.json({
    ok: true,
    data: {
      ...summary,
      desks: desks.map((d) => ({
        code: d.code,
        name: d.name,
        location: d.location,
        cctv: d.cctv,
        qr_payload: d.qr_payload ?? buildWorkstationQrPayload(d.code),
        locked: globalOff || isDeskCodeLocked(d.code) || d.is_active === false,
        active: d.is_active !== false,
      })),
    },
  });
}
