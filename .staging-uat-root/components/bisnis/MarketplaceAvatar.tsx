"use client";

import { Globe } from "lucide-react";
import type { SalesChannel } from "@/lib/bisnis/types";
import { resolveMarketplaceBrand } from "@/lib/bisnis/mp-brand";

const SIZE = {
  sm: { box: "h-8 w-8 text-[10px]", icon: "h-4 w-4" },
  md: { box: "h-10 w-10 text-xs", icon: "h-5 w-5" },
  lg: { box: "h-12 w-12 text-sm", icon: "h-6 w-6" },
} as const;

type Props = {
  channel: Pick<SalesChannel, "name" | "code">;
  size?: keyof typeof SIZE;
  className?: string;
};

export function MarketplaceAvatar({ channel, size = "md", className = "" }: Props) {
  const brand = resolveMarketplaceBrand(channel);
  const s = SIZE[size];

  if (brand.label.length <= 3) {
    return (
      <div
        className={`${s.box} flex shrink-0 items-center justify-center rounded-xl font-bold tracking-tight ${className}`}
        style={{ backgroundColor: brand.bg, color: brand.text }}
        title={channel.name}
      >
        {brand.label}
      </div>
    );
  }

  return (
    <div
      className={`${s.box} flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ${className}`}
      title={channel.name}
    >
      <Globe className={s.icon} />
    </div>
  );
}
