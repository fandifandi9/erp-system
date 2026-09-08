"use client";

import Image from "next/image";
import { useState } from "react";

type UserAvatarProps = {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
};

export function UserAvatar({ name, src, size = 36, className = "" }: UserAvatarProps) {
  const [broken, setBroken] = useState(false);
  const initial = (name.trim().charAt(0) || "U").toUpperCase();
  const dim = `${size}px`;

  if (src && !broken) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        unoptimized
        onError={() => setBroken(true)}
        className={`rounded-full object-cover border-2 border-slate-200 ${className}`}
        style={{ width: dim, height: dim }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-semibold ${className}`}
      style={{ width: dim, height: dim, fontSize: Math.max(12, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
