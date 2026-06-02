import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BlurActiveInputOnRoute from "@/components/BlurActiveInputOnRoute";
import WebPwaCleanup from "@/components/WebPwaCleanup";
import WebSessionGuard from "@/components/WebSessionGuard";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SERBA System", template: "%s · SERBA System" },
  description: "SERBA System — absensi, HR, cuti, lembur, aktivitas luar, payroll.",
  applicationName: "SERBA System",
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full min-h-[100dvh] flex flex-col touch-manipulation">
        <WebPwaCleanup />
        <WebSessionGuard />
        <BlurActiveInputOnRoute />
        {children}
      </body>
    </html>
  );
}
