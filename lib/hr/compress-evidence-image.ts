/** Browser-only: resize/compress evidence. Fallback is original file (server still validates). */

const MAX_EDGE = 1920;
const QUALITY = 0.85;

export async function compressEvidenceImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 1_200_000) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, mime, mime === "image/jpeg" ? QUALITY : undefined),
    );
    bitmap.close();
    if (!blob) return file;
    if (blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, mime === "image/png" ? ".png" : ".jpg");
    return new File([blob], name, { type: mime });
  } catch {
    return file;
  }
}
