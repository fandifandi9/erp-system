"use client";

import { getAppVersionDisplay } from "@/lib/app-version";

type Variant = "dashboard" | "attendancePwa" | "login";

const variantClass: Record<Variant, string> = {
  dashboard:
    "bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))]",
  attendancePwa:
    "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))]",
  login:
    "top-[max(0.75rem,env(safe-area-inset-top,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))]",
};

const variantZ: Record<Variant, string> = {
  dashboard: "z-[105]",
  attendancePwa: "z-[105]",
  login: "z-[105]",
};

/**
 * Tanda versi kecil, tetap terbaca; tidak menangkap klik (pointer-events-none).
 */
export function AppVersionWatermark({ variant = "dashboard" }: { variant?: Variant }) {
  const label = getAppVersionDisplay();
  return (
    <div
      className={`pointer-events-none fixed ${variantZ[variant]} select-none ${variantClass[variant]}`}
      aria-hidden
    >
      <span
        className="inline-block rounded-md border border-slate-300/90 bg-white/95 px-2 py-1 font-mono text-[11px] font-bold tracking-wide text-slate-700 shadow-md ring-1 ring-slate-200/80"
        title={`Versi ${label}`}
      >
        {label}
      </span>
    </div>
  );
}
