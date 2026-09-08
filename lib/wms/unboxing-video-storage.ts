/** @deprecated gunakan @/lib/wms/unboxing-media-storage */
export {
  saveUnboxingVideoLocal,
  saveUnboxingPhotoLocal,
  type UnboxingEntityKind,
} from "./unboxing-media-storage";

import path from "path";

export function getUnboxingVideoRoot(): string {
  const root = process.env.LOCAL_UNBOXING_VIDEO_DIR?.trim();
  return path.resolve(root || path.join(process.cwd(), "data", "unboxing-videos"));
}
