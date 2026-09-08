"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";

/** Satu URL profil untuk semua peran: `/profile`. */
export default function HrProfileRedirectPage() {
  const router = useRouter();
  const { t } = useLocale();

  useEffect(() => {
    router.replace("/profile");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      {t("hr.profile.redirecting")}
    </div>
  );
}
