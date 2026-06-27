import fs from "fs/promises";
import path from "path";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const VIDEO_EXT = new Set([".webm", ".mp4", ".mov", ".mkv"]);
const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

export type UnboxingEntityKind = "sales_return" | "purchase_receiving" | "purchase_return";

function mediaRoot(): string {
  const root = process.env.LOCAL_UNBOXING_VIDEO_DIR?.trim();
  if (!root) {
    throw new Error(
      "LOCAL_UNBOXING_VIDEO_DIR belum diatur — unggah bukti ke HDD lokal (lihat .env.example) atau lewati tanpa bukti.",
    );
  }
  return path.resolve(root);
}

async function saveFile(input: {
  buffer: Buffer;
  originalName: string;
  entityKind: UnboxingEntityKind;
  entityId: string;
  subdir: "video" | "photos";
  allowedExt: Set<string>;
  defaultExt: string;
  maxBytes: number;
}): Promise<string> {
  if (input.buffer.length > input.maxBytes) {
    throw new Error("File bukti terlalu besar.");
  }
  const root = mediaRoot();
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(root, y, m, input.entityKind, input.subdir);
  await fs.mkdir(dir, { recursive: true });

  const ext = path.extname(input.originalName || "").toLowerCase() || input.defaultExt;
  const safeExt = input.allowedExt.has(ext) ? ext : input.defaultExt;
  const base = `${input.entityKind}-${input.entityId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${safeExt}`;
  const fullPath = path.join(dir, base);
  await fs.writeFile(fullPath, input.buffer);
  return fullPath;
}

export async function saveUnboxingVideoLocal(input: {
  buffer: Buffer;
  originalName: string;
  entityKind: UnboxingEntityKind;
  entityId: string;
}): Promise<string> {
  return saveFile({
    ...input,
    subdir: "video",
    allowedExt: VIDEO_EXT,
    defaultExt: ".webm",
    maxBytes: MAX_VIDEO_BYTES,
  });
}

export async function saveUnboxingPhotoLocal(input: {
  buffer: Buffer;
  originalName: string;
  entityKind: UnboxingEntityKind;
  entityId: string;
}): Promise<string> {
  return saveFile({
    ...input,
    subdir: "photos",
    allowedExt: PHOTO_EXT,
    defaultExt: ".jpg",
    maxBytes: MAX_PHOTO_BYTES,
  });
}
