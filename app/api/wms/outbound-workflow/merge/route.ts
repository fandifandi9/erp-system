import { NextResponse } from "next/server";
import { bisnisApiError, requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import { mergeOutboundWorkflowServer } from "@/lib/wms/merge-outbound-workflow-server";
import type { OutboundWorkflow } from "@/lib/wms/outbound-workflow";

type MergeBody = {
  salesOrderId?: string;
  workflow?: OutboundWorkflow;
};

export async function POST(req: Request) {
  try {
    await requirePenjualanOrWmsApiUser(req);
    const body = (await req.json()) as MergeBody;
    const salesOrderId = body.salesOrderId?.trim();
    if (!salesOrderId) throw bisnisApiError("salesOrderId wajib.", 400);
    if (!body.workflow) throw bisnisApiError("workflow wajib.", 400);

    const workflow = await mergeOutboundWorkflowServer(salesOrderId, body.workflow);
    return NextResponse.json({ ok: true, workflow });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    const message = err instanceof Error ? err.message : "Gagal merge workflow outbound.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
