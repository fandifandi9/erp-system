import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

const MAX_FILES = 3;
const MAX_BYTES = 4 * 1024 * 1024;

/** Upload foto WMS (max 3, ~3MP disarankan di client). */
export async function POST(req: Request) {
  try {
    const auth = await getApiAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const pb = await getInventoryAdminPb();

    const form = await req.formData();
    const entityType = String(form.get("entity_type") ?? "biz_sales_orders");
    const entityId = String(form.get("entity_id") ?? "");
    const warehouse = String(form.get("warehouse") ?? "");
    const purpose = String(form.get("purpose") ?? "wms");

    if (!entityId) {
      return NextResponse.json({ ok: false, error: "entity_id wajib" }, { status: 400 });
    }

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: "Tidak ada file" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ ok: false, error: `Maksimal ${MAX_FILES} foto` }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "public", "uploads", "wms", entityId);
    await mkdir(dir, { recursive: true });

    const ids: string[] = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: "Ukuran file terlalu besar (max 4MB per foto)" },
          { status: 400 },
        );
      }
      const ext = file.type.includes("png") ? "png" : "jpg";
      const name = `${purpose}-${randomUUID()}.${ext}`;
      const rel = `uploads/wms/${entityId}/${name}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(process.cwd(), "public", rel), buf);

      const row = await pb.collection(INV_COLLECTIONS.mediaFiles).create({
        storage_root: "public",
        relative_path: rel,
        original_filename: file.name,
        mime_type: file.type || "image/jpeg",
        size_bytes: file.size,
        entity_type: entityType,
        entity_id: entityId,
        warehouse: warehouse || "",
        captured_at: new Date().toISOString(),
        uploaded_at: new Date().toISOString(),
        uploaded_by: auth.userId,
        is_verified: false,
      });
      ids.push(row.id);
    }

    return NextResponse.json({ ok: true, file_ids: ids, paths: ids.map((_, i) => `/uploads/wms/${entityId}`) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload gagal";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
