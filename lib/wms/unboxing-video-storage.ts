/** @deprecated gunakan @/lib/wms/unboxing-media-storage */
export {
  saveUnboxingVideoLocal,
  saveUnboxingPhotoLocal,
  type UnboxingEntityKind,
} from "./unboxing-media-storage";

import path from "path";

export function getUnboxingVideoRoot(): string {
  const root = process.env.LOCAL_UNBOXING_VIDEO_DIR?.trim();
  if (!root) {
    throw new Error(
      "LOCAL_UNBOXING_VIDEO_DIR belum diatur — simpan bukti unboxing di HDD lokal (lihat .env.example).",
    );
  }
  return path.resolve(root);
}
