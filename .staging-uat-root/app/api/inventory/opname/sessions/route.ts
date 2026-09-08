import { NextResponse } from "next/server";
import { jsonError, requireInventorySupervisorAccess } from "@/lib/inventory/api-auth";
import { getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { createOpnameSession } from "@/lib/inventory/opname-engine";
import type { OpnameCountMethod } from "@/lib/inventory/types";

export async function POST(req: Request) {
  try {
    const auth = await requireInventorySupervisorAccess(req);
    const body = (await req.json()) as {
      warehouse: string;
      count_method: OpnameCountMethod;
      notes?: string;
    };

    const pb = await getUserPbFromRequest(req, auth);
    const session = await createOpnameSession(pb, auth.userId, body);

    return NextResponse.json({
      ok: true,
      data: { id: session.id, opname_no: session.opname_no },
    });
  } catch (err) {
    return jsonError(err);
  }
}
