"use client";

import { blurActiveElement } from "@/lib/blur-active-input";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function BlurActiveInputOnRoute() {
  const pathname = usePathname();
  useEffect(() => {
    blurActiveElement();
  }, [pathname]);
  return null;
}
