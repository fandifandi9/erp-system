import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

type Props = { size: number };

let cachedB64: string | null = null;

async function logoDataUrl(): Promise<string> {
  if (cachedB64) return cachedB64;
  const buf = await readFile(path.join(process.cwd(), "public/systemLogo.png"));
  cachedB64 = `data:image/png;base64,${buf.toString("base64")}`;
  return cachedB64;
}

/** Favicon / PWA / Apple Touch — dari `public/systemLogo.png` (sama dengan app mobile). */
export async function serbaIconImageResponse({ size }: Props) {
  const src = await logoDataUrl();
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={size} height={size} style={{ objectFit: "contain" }} alt="" />
      </div>
    ),
    { width: size, height: size }
  );
}
