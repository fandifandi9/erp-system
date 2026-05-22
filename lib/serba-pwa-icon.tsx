import { ImageResponse } from "next/og";

type Props = { size: number };

/**
 * Satu sumber visual untuk favicon dan Apple Touch Icon.
 * Full bleed (isi penuh kotak), latar opaque — menghindari padding putih di iOS / launcher.
 *
 * Untuk mengganti merek: ubah gradien / huruf di bawah.
 * agar memakai file statis di `public/icons/` (PNG buatan desain).
 */
export function serbaIconImageResponse({ size }: Props) {
  const fontSize = Math.max(12, Math.round(size * 0.48));

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #1e1b4b 0%, #4338ca 42%, #6366f1 100%)",
        }}
      >
        <span
          style={{
            fontSize,
            fontWeight: 800,
            color: "white",
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          S
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
