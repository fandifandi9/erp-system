"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/design/cn";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "E";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const sizeClass = {
  sm: "h-9 w-9 text-[10px]",
  md: "h-12 w-12 text-xs",
  lg: "h-14 w-14 text-sm",
} as const;

/** Entity logo with initials/building fallback — never shows broken image. */
export function EntityBrandMark({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name?: string;
  logoUrl?: string | null;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(logoUrl?.trim()) && !imgError;
  const label = name?.trim() || "Entity";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-erp-border bg-erp-surface-muted",
        sizeClass[size],
        className,
      )}
      aria-hidden={!name}
    >
      {showImage ? (
        <img
          src={logoUrl!}
          alt=""
          className="h-full w-full object-contain p-1"
          onError={() => setImgError(true)}
        />
      ) : name ? (
        <span className="font-bold text-erp-text-muted">{initialsFromName(label)}</span>
      ) : (
        <Building2 className="h-5 w-5 text-erp-text-subtle" strokeWidth={1.5} />
      )}
    </div>
  );
}
