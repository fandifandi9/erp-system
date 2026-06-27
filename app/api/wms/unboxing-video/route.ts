import { NextResponse } from "next/server";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import {
  saveUnboxingPhotoLocal,
  saveUnboxingVideoLocal,
  type UnboxingEntityKind,
} from "@/lib/wms/unboxing-media-storage";
import { serializeUnboxingMedia } from "@/lib/wms/unboxing-media";

export async function POST(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });

    const form = await req.formData();
    const video = form.get("video");
    const photoFiles = form
      .getAll("photos")
      .filter((f): f is File => f instanceof File && f.size > 0);
    const entityKind = String(form.get("entity_kind") || "sales_return") as UnboxingEntityKind;
    const entityId = String(form.get("entity_id") || "").trim();

    if (!entityId) {
      return NextResponse.json({ error: "entity_id wajib" }, { status: 400 });
    }
    if (
      entityKind !== "sales_return" &&
      entityKind !== "purchase_receiving" &&
      entityKind !== "purchase_return"
    ) {
      return NextResponse.json({ error: "entity_kind tidak valid" }, { status: 400 });
    }

    const hasVideo = video instanceof File && video.size > 0;
    if (!hasVideo && photoFiles.length === 0) {
      return NextResponse.json({ ok: true, path: "", media: {} });
    }

    let videoPath: string | undefined;
    if (hasVideo) {
      const buffer = Buffer.from(await video.arrayBuffer());
      videoPath = await saveUnboxingVideoLocal({
        buffer,
        originalName: video.name,
        entityKind,
        entityId,
      });
    }

    const photoPaths: string[] = [];
    for (const file of photoFiles.slice(0, 10)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      photoPaths.push(
        await saveUnboxingPhotoLocal({
          buffer,
          originalName: file.name,
          entityKind,
          entityId,
        }),
      );
    }

    const serialized = serializeUnboxingMedia({ video: videoPath, photos: photoPaths });
    return NextResponse.json({
      ok: true,
      path: serialized ?? "",
      media: { video: videoPath, photos: photoPaths },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menyimpan bukti unboxing" },
      { status: 500 },
    );
  }
}
