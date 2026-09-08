import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

type Props = {
  size: number;
  /** Latar ikon. Favicon pakai transparan; Apple Touch wajib opaque (putih). */
  background?: string;
  /** Perbesar logo (sumber punya padding safe-zone adaptive icon ±38%). */
  zoom?: number;
};

let cachedB64: string | null = null;

async function logoDataUrl(): Promise<string> {
  if (cachedB64) return cachedB64;
  const buf = await readFile(path.join(process.cwd(), "public/systemLogo.png"));
  cachedB64 = `data:image/png;base64,${buf.toString("base64")}`;
  return cachedB64;
}

/** Favicon / PWA / Apple Touch — dari `public/systemLogo.png` (sama dengan app mobile). */
export async function serbaIconImageResponse({
  size,
  background = "transparent",
  zoom = 1,
}: Props) {
  const src = await logoDataUrl();
  const imgSize = Math.round(size * zoom);
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={imgSize} height={imgSize} style={{ objectFit: "contain" }} alt="" />
      </div>
    ),
    { width: size, height: size }
  );
}
