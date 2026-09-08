import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { completeSalesReturnResendHandover } from "@/lib/wms/sales-return-resend";
import { invalidateInboundQueueCache } from "@/lib/wms/inbound-queue-server";

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    const body = (await req.json().catch(() => ({}))) as {
      returId?: string;
      scannedCode?: string;
      driverName?: string;
      driverPhone?: string;
      courierCompany?: string;
      photoIds?: string[];
    };
    if (!body.returId?.trim()) {
      return NextResponse.json({ ok: false, error: "returId wajib." }, { status: 400 });
    }
    const adminPb = await getInventoryAdminPb();
    const retur = await completeSalesReturnResendHandover(adminPb, {
      returId: body.returId.trim(),
      userId: auth.userId,
      scannedCode: body.scannedCode,
      driverName: body.driverName,
      driverPhone: body.driverPhone,
      courierCompany: body.courierCompany,
      photoIds: body.photoIds,
    });
    invalidateInboundQueueCache();
    return NextResponse.json({ ok: true, data: { retur } });
  } catch (err) {
    return jsonError(err, "Gagal menyelesaikan kirim kembali retur.");
  }
}
