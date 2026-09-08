import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import {
  rejectClientAttendanceForgeFields,
  serverCheckIn,
} from "@/lib/hr/attendance-server";

function parseCoords(body: Record<string, unknown>) {
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : null;
  const accuracy = body.accuracy != null ? Number(body.accuracy) : null;
  return {
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
    accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
    device_id: body.device_id != null ? String(body.device_id) : null,
  };
}

/** POST /api/hr/attendance/check-in — authenticated employee check-in. */
export async function POST(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, unknown> = {};
    let selfie: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const [k, v] of form.entries()) {
        if (v instanceof File && k === "selfie") {
          selfie = v;
        } else if (typeof v === "string") {
          body[k] = v;
        }
      }
    } else {
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }

    rejectClientPrivilegeFields(body);
    rejectClientAttendanceForgeFields(body);

    const coords = parseCoords(body);
    const clientChannel =
      body.client_channel === "web" || body.client_channel === "mobile"
        ? body.client_channel
        : "mobile";
    const adminPb = await getInventoryAdminPb();
    const result = await serverCheckIn(adminPb, ctx, {
      ...coords,
      selfie,
      client_channel: clientChannel,
    });

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.message, message: result.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      data: result.data,
      id: result.id,
    });
  } catch (err) {
    if (err instanceof HrApiError && err.status === 400) {
      return hrJsonError(err);
    }
    return hrJsonError(err);
  }
}
