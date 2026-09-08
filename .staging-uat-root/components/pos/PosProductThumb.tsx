"use client";

import Image from "next/image";
import { Package } from "lucide-react";

export function PosProductThumb({
  src,
  alt,
  size = "md",
}: {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? 80 : size === "md" ? 64 : 48;
  const box = `relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white`;

  if (!src) {
    return (
      <div
        className={`${box} flex items-center justify-center bg-slate-100 text-slate-400`}
        style={{ width: dim, height: dim }}
      >
        <Package className={size === "sm" ? "h-5 w-5" : "h-7 w-7"} />
      </div>
    );
  }

  return (
    <div className={box} style={{ width: dim, height: dim }}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes={`${dim}px`}
        unoptimized
      />
    </div>
  );
}
