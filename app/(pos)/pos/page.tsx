"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadPosSession } from "@/lib/pos/session";

export default function PosHomePage() {
  const router = useRouter();

  useEffect(() => {
    const s = loadPosSession();
    router.replace(s ? "/pos/sale" : "/pos/setup");
  }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
      Mengalihkan…
    </div>
  );
}
