"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { getDefaultRouteForUser } from "@/lib/rbac";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = pb.authStore.model;

    if (!user) {
      router.push("/login");
      return;
    }
    router.push(getDefaultRouteForUser(user as Record<string, unknown>));
  }, [router]);

  return null;
}