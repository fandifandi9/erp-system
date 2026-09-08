import type { NextConfig } from "next";

const pocketBaseUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://72.62.194.224:8091";
const parsedPocketBaseUrl = new URL(pocketBaseUrl);

/** Outbound gudang → permintaan barang. Inbound (penerimaan/qc/putaway) tetap di /gudang/*. */
const GUDANG_TO_WMS_REDIRECTS = [
  "picking",
  "validasi",
  "packing",
  "pickup",
  "selesai",
  "barcode",
] as const;

const GUDANG_TO_PERMINTAAN_BARANG = new Set(["picking", "validasi", "packing", "pickup", "selesai"]);

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return GUDANG_TO_WMS_REDIRECTS.map((segment) => ({
      source: `/gudang/${segment}`,
      destination: GUDANG_TO_PERMINTAAN_BARANG.has(segment)
        ? `/wms/permintaan-barang/${segment === "packing" ? "validasi" : segment}`
        : `/wms/${segment}`,
      permanent: false,
    }));
  },
  images: {
    // Izinkan next/image lokal dengan query string (mis. /systemLogoWide.png?v=2 untuk cache-bust).
    localPatterns: [{ pathname: "/**" }],
    remotePatterns: [
      {
        protocol: parsedPocketBaseUrl.protocol.replace(":", "") as "http" | "https",
        hostname: parsedPocketBaseUrl.hostname,
        port: parsedPocketBaseUrl.port || "",
        pathname: "/api/files/**",
      },
      // Keep localhost for local PB/dev scenarios.
      {
        protocol: "http",
        hostname: "localhost",
        port: "8091",
        pathname: "/api/files/**",
      },
    ],
  },
  // ========================================
  // 🔐 SECURITY HEADERS
  // ========================================
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
