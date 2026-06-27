"use client";

import { Store } from "lucide-react";
import type { Store as StoreType } from "@/lib/bisnis/types";
import { pb } from "@/lib/pocketbase";

const SIZE = {
  sm: { box: "h-8 w-8", icon: "h-4 w-4", img: "rounded-lg" },
  md: { box: "h-10 w-10", icon: "h-5 w-5", img: "rounded-xl" },
  lg: { box: "h-12 w-12", icon: "h-6 w-6", img: "rounded-xl" },
} as const;

function getLogoUrl(store: StoreType): string | null {
  if (!store.logo || !store.collectionId) return null;
  return pb.files.getURL(
    store as unknown as { id: string; collectionId: string; collectionName: string },
    store.logo,
  );
}

type Props = {
  store: StoreType;
  size?: keyof typeof SIZE;
  className?: string;
};

export function StoreAvatar({ store, size = "md", className = "" }: Props) {
  const s = SIZE[size];
  const logo = getLogoUrl(store);

  if (logo) {
    return (
      <img
        src={logo}
        alt={store.name}
        className={`${s.box} shrink-0 border border-slate-200 object-cover ${s.img} ${className}`}
      />
    );
  }

  return (
    <div
      className={`${s.box} flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ${className}`}
      title={store.name}
    >
      <Store className={s.icon} />
    </div>
  );
}
