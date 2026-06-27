"use client";

import { Monitor } from "lucide-react";

const SIZE = {
  sm: { box: "h-8 w-8", icon: "h-4 w-4" },
  md: { box: "h-10 w-10", icon: "h-5 w-5" },
  lg: { box: "h-12 w-12", icon: "h-6 w-6" },
} as const;

const HUES = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6"];

function hueFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % HUES.length;
  return HUES[hash];
}

type PosRegisterLike = { code: string; name: string };

type Props = {
  register: Pick<PosRegisterLike, "code" | "name">;
  size?: keyof typeof SIZE;
  className?: string;
};

export function PosRegisterAvatar({ register, size = "md", className = "" }: Props) {
  const s = SIZE[size];
  const bg = hueFor(register.code || register.name);

  return (
    <div
      className={`${s.box} flex shrink-0 items-center justify-center rounded-xl text-white ${className}`}
      style={{ backgroundColor: bg }}
      title={register.name}
    >
      <Monitor className={s.icon} />
    </div>
  );
}
