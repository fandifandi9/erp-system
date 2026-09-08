import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { listEmployeeDocuments } from "@/lib/hr/employee-document-server";

/** GET /api/profile/self/documents — current user's private documents. */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const items = await listEmployeeDocuments(adminPb, ctx);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/profile/self/documents — upload/replace self document (multipart). */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const formData = await req.formData();
    const documentType = String(formData.get("document_type") ?? "").trim();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "File wajib diunggah." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const adminPb = await getInventoryAdminPb();
    const { uploadSelfEmployeeDocument } = await import("@/lib/hr/employee-document-server");
    const doc = await uploadSelfEmployeeDocument(adminPb, ctx, documentType, {
      bytes,
      declaredMime: file.type,
      originalName: file.name,
    });
    return NextResponse.json({ ok: true, data: doc });
  } catch (err) {
    return hrJsonError(err);
  }
}
