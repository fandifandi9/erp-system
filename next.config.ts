import type { NextConfig } from "next";

const pocketBaseUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://72.62.194.224:8091";
const parsedPocketBaseUrl = new URL(pocketBaseUrl);

const GUDANG_TO_WMS_REDIRECTS = [
  "picking",
  "validasi",
  "packing",
  "pickup",
  "penerimaan",
  "qc",
  "putaway",
] as const;

const nextConfig: NextConfig = {
  async redirects() {
    return GUDANG_TO_WMS_REDIRECTS.map((segment) => ({
      source: `/gudang/${segment}`,
      destination: `/wms/${segment === "penerimaan" ? "receiving" : segment}`,
      permanent: false,
    }));
  },
  images: {
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
