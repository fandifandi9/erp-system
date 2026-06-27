"use client";

import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { ROLE_ACCESS_SUMMARY } from "@/lib/rbac";
import { INVENTORY_WEB_PATHS } from "@/lib/inventory/access";
import { useLocale } from "@/components/LocaleProvider";

export default function RolePermissionPage() {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/pengaturan" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" />
          {t("pengaturan.common.back")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t("pengaturan.role.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("pengaturan.role.subtitle")}{" "}
          <Link href="/system/register" className="text-indigo-600 hover:underline">
            {t("pengaturan.common.usersLink")}
          </Link>
          .
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-indigo-900">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            {t("pengaturan.role.inventoryHint")}{" "}
            <strong>
              {t("pengaturan.role.inventoryRoutes", { count: INVENTORY_WEB_PATHS.length })}{" "}
              {t("pengaturan.role.inventorySuffix")}
            </strong>
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {ROLE_ACCESS_SUMMARY.map((role) => (
          <div key={role.code} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800">{role.label}</h2>
            <p className="mt-2 text-xs text-slate-500">
              {t("pengaturan.role.basePaths", { count: role.paths.length })}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.paths.slice(0, 24).map((p) => (
                <span key={p} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {p}
                </span>
              ))}
              {role.paths.length > 24 ? (
                <span className="text-xs text-slate-400">
                  {t("pengaturan.role.morePaths", { count: role.paths.length - 24 })}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
