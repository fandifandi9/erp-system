"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RegisterUserPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/hr/employees/new");
  }, [router]);

  return null;
}