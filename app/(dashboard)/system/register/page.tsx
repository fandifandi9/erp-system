"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { isOwnerOrHrAccount } from "@/lib/auth-model";

export default function RegisterUserPage() {
  const router = useRouter();

  useEffect(() => {
    const user = pb.authStore.model;
    if (isOwnerOrHrAccount(user as Record<string, unknown> | null)) {
      router.replace("/hr/employees/new");
      return;
    }
    router.replace("/hr/employees");
  }, [router]);

  return null;
}
