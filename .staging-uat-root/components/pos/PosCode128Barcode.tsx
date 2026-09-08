"use client";

import { useEffect, useState } from "react";
import { generateCode128DataUrl } from "@/lib/inventory/barcode-label-engine";

/** Barcode Code128 — bisa discan scanner 1D / kamera HP. */
export function PosCode128Barcode({
  value,
  height = 64,
}: {
  value: string;
  height?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = value.trim();
    if (!code || code === "—") {
      setSrc(null);
      setFailed(false);
      return;
    }
    setFailed(false);
    void generateCode128DataUrl(code, { barHeight: height, barWidth: 2 })
      .then((url) => setSrc(url))
      .catch(() => setFailed(true));
  }, [value, height]);

  if (!value.trim() || value === "—") return null;
  if (failed) {
    return (
      <p className="text-center font-mono text-lg font-bold tracking-wider">{value}</p>
    );
  }
  if (!src) {
    return <div className="mx-auto h-16 w-full max-w-[260px] animate-pulse rounded bg-slate-100" />;
  }
  return (
    <img
      src={src}
      alt={`Barcode ${value}`}
      className="mx-auto block h-auto max-h-20 w-full max-w-[280px] object-contain"
    />
  );
}
