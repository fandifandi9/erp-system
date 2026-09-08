/** Client-side evidence checks. Server `lib/hr/reporting-validate.ts` remains authoritative. */

export const EVIDENCE_MAX_COUNT = 5;
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type PickerAssetLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type EvidenceFile = { uri: string; name: string; type: string };

export type EvidenceCheck =
  | { ok: true; file: EvidenceFile }
  | { ok: false; errorKey: "fileTooLarge" | "fileType" };

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

function mimeOf(asset: PickerAssetLike): string {
  return String(asset.mimeType || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
}

function looksHeic(asset: PickerAssetLike): boolean {
  const mime = mimeOf(asset);
  if (ALLOWED_MIME.has(mime) || mime === "image/jpg") return false;
  const ext = extOf(String(asset.fileName || asset.uri || ""));
  return mime.includes("heic") || mime.includes("heif") || ext === "heic" || ext === "heif";
}

function fileNameFor(asset: PickerAssetLike, mime: string): string {
  const raw = String(asset.fileName || "").trim();
  if (raw && !looksHeic({ ...asset, fileName: raw })) return raw;
  if (mime === "image/png") return "evidence.png";
  if (mime === "image/webp") return "evidence.webp";
  return "evidence.jpg";
}

export function validateEvidenceAsset(asset: PickerAssetLike): EvidenceCheck {
  if (typeof asset.fileSize === "number" && Number.isFinite(asset.fileSize) && asset.fileSize > EVIDENCE_MAX_BYTES) {
    return { ok: false, errorKey: "fileTooLarge" };
  }
  if (looksHeic(asset)) {
    return { ok: false, errorKey: "fileType" };
  }
  let mime = mimeOf(asset);
  if (mime === "image/jpg") mime = "image/jpeg";
  const ext = extOf(String(asset.fileName || asset.uri || ""));
  if (!mime) {
    if (ext === "png") mime = "image/png";
    else if (ext === "webp") mime = "image/webp";
    else if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
    else mime = "image/jpeg";
  }
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, errorKey: "fileType" };
  }
  const type = mime === "image/jpg" ? "image/jpeg" : mime;
  return {
    ok: true,
    file: {
      uri: asset.uri,
      name: fileNameFor(asset, type),
      type,
    },
  };
}
