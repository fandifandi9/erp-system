"use client";

import { Truck } from "lucide-react";
import type { Courier } from "@/lib/bisnis/types";
import { resolveCourierBrand } from "@/lib/bisnis/courier-brand";
import { getCourierLogoUrl } from "@/lib/bisnis/courier-logo";

const SIZE = {
  sm: { box: "h-8 w-8 text-[10px]", icon: "h-4 w-4" },
  md: { box: "h-10 w-10 text-xs", icon: "h-5 w-5" },
  lg: { box: "h-12 w-12 text-sm", icon: "h-6 w-6" },
} as const;

type Props = {
  courier: Pick<Courier, "id" | "name" | "code" | "logo" | "collectionId" | "collectionName">;
  size?: keyof typeof SIZE;
  className?: string;
};

export function CourierAvatar({ courier, size = "md", className = "" }: Props) {
  const logoUrl = getCourierLogoUrl(courier);
  const brand = resolveCourierBrand(courier);
  const s = SIZE[size];

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={courier.name}
        className={`${s.box} shrink-0 rounded-xl border border-slate-200 object-cover ${className}`}
      />
    );
  }

  if (brand.label.length <= 3) {
    return (
      <div
        className={`${s.box} flex shrink-0 items-center justify-center rounded-xl font-bold tracking-tight ${className}`}
        style={{ backgroundColor: brand.bg, color: brand.text }}
        title={courier.name}
      >
        {brand.label}
      </div>
    );
  }

  return (
    <div
      className={`${s.box} flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ${className}`}
      title={courier.name}
    >
      <Truck className={s.icon} />
    </div>
  );
}
