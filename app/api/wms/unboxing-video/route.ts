import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { Readable } from "stream";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  saveUnboxingPhotoLocal,
  saveUnboxingVideoLocal,
  resolveSafeUnboxingFilePath,
  type UnboxingEntityKind,
} from "@/lib/wms/unboxing-media-storage";
import { parseUnboxingMedia, serializeUnboxingMedia } from "@/lib/wms/unboxing-media";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".mkv":
      return "video/x-matroska";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
    case ".heif":
      return "image/heic";
    case ".jpg":
    case ".jpeg":
    default:
      return "image/jpeg";
  }
}

/** Tampilkan bukti unboxing retur (auth wajib). */
export async function GET(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });

    const url = new URL(req.url);
    const returId = url.searchParams.get("retur_id")?.trim() || "";
    const kind = url.searchParams.get("kind")?.trim() || "video";
    const index = Math.max(0, Number(url.searchParams.get("index") || 0) || 0);

    if (!returId) {
      return NextResponse.json({ error: "retur_id wajib" }, { status: 400 });
    }
    if (kind !== "video" && kind !== "photo") {
      return NextResponse.json({ error: "kind tidak valid" }, { status: 400 });
    }

    const adminPb = await getInventoryAdminPb();
    const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
    const media = parseUnboxingMedia(retur.unboxing_video_path);
    const stored =
      kind === "video" ? media.video : (media.photos ?? [])[index];
    if (!stored) {
      return NextResponse.json({ error: "Bukti tidak ditemukan" }, { status: 404 });
    }

    const safePath = resolveSafeUnboxingFilePath(stored);
    if (!safePath) {
      return NextResponse.json({ error: "Path bukti tidak valid" }, { status: 400 });
    }

    const info = await stat(safePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "File bukti tidak ditemukan" }, { status: 404 });
    }

    const nodeStream = createReadStream(safePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": contentTypeFor(safePath),
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memuat bukti unboxing" },
      { status: 500 },
    );
  }
}

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
