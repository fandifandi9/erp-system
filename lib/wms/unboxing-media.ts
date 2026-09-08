export type UnboxingMedia = {
  video?: string;
  photos?: string[];
};

export function parseUnboxingMedia(raw?: string | null): UnboxingMedia {
  if (!raw?.trim()) return {};
  const t = raw.trim();
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t) as UnboxingMedia;
      return {
        video: parsed.video?.trim() || undefined,
        photos: Array.isArray(parsed.photos)
          ? parsed.photos.map((p) => String(p).trim()).filter(Boolean)
          : undefined,
      };
    } catch {
      return { video: t };
    }
  }
  return { video: t };
}

export function serializeUnboxingMedia(media: UnboxingMedia): string | undefined {
  const video = media.video?.trim();
  const photos = (media.photos ?? []).map((p) => p.trim()).filter(Boolean);
  if (!video && photos.length === 0) return undefined;
  if (video && photos.length === 0) return video;
  return JSON.stringify({ video: video || undefined, photos });
}

export function hasUnboxingMedia(raw?: string | null): boolean {
  const m = parseUnboxingMedia(raw);
  return Boolean(m.video || (m.photos?.length ?? 0) > 0);
}

/** URL API untuk menampilkan bukti unboxing retur. */
export function unboxingMediaApiUrl(
  returId: string,
  kind: "video" | "photo",
  index = 0,
): string {
  const q = new URLSearchParams({
    retur_id: returId,
    kind,
  });
  if (kind === "photo") q.set("index", String(index));
  return `/api/wms/unboxing-video?${q.toString()}`;
}
