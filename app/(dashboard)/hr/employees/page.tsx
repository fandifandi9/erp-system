"use client";

import { pb } from "@/lib/pocketbase";
import {
  getMaxBookingsPerMonth,
  PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD,
} from "@/lib/leave";
import { formatIntegerId } from "@/lib/format-number";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { isOwnerAccount } from "@/lib/auth-model";
import { hasEmployeeCapability } from "@/lib/capabilities/employee";
import { canAccessEmployeeCreate, canAccessEmployeeManagement } from "@/lib/capabilities/web-access";
import {
  hrApiActivateEmployee,
  hrApiDeactivateEmployee,
  hrApiAuthHeaders,
  hrApiListEmployees,
} from "@/lib/hr/hr-api-client";

type EmployeeProfile = {
  id: string;
  userId: string | null;
  name: string;
  /** Nama jabatan dari struktur organisasi; kosong jika belum di-link. */
  position: string;
  email: string;
  dashboardAccess: boolean;
  status: string;
  /** Maks. pengajuan cuti (pending + disetujui) per bulan kalender; dari profil atau default. */
  leaveBookingsQuota: number;
  /** HR: wajib selfie sebelum check-in (app native). */
  requireCheckinSelfie: boolean;
};

type EntityOpt = { id: string; company_name: string };

export default function EmployeesPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [entities, setEntities] = useState<EntityOpt[]>([]);
  /** Owner filter: "" = semua entitas */
  const [ownerEntityFilter, setOwnerEntityFilter] = useState("");

  const currentUser = pb.authStore.model;
  const hasAccess = canAccessEmployeeManagement(currentUser as Record<string, unknown> | null);
  const isOwnerUser = isOwnerAccount(currentUser as Record<string, unknown> | null);
  const canActivate = hasEmployeeCapability(
    currentUser as Record<string, unknown> | null,
    "employee.activate",
  );
  const canDeactivate = hasEmployeeCapability(
    currentUser as Record<string, unknown> | null,
    "employee.deactivate",
  );

  // ================= TOGGLE STATUS =================
  const toggleStatus = async (profile: EmployeeProfile) => {
    const activating = profile.status !== "active";
    if (activating && !canActivate) {
      alert(t("hr.common.ownerOnlyStatus"));
      return;
    }
    if (!activating && !canDeactivate) {
      alert(t("hr.common.ownerOnlyStatus"));
      return;
    }

    if (!profile?.userId) {
      alert(t("hr.common.invalidUser"));
      return;
    }

    try {
      if (activating) {
        await hrApiActivateEmployee(profile.userId);
      } else {
        await hrApiDeactivateEmployee(profile.userId);
      }

      setProfiles((prev) =>
        prev.map((p) =>
          p.userId === profile.userId
            ? { ...p, status: activating ? "active" : "inactive" }
            : p
        )
      );
    } catch (err) {
      console.error("[hr/employees] toggle status:", err);
      alert(err instanceof Error ? err.message : t("hr.common.saveFailed"));
    }
  };

  // ================= FETCH DATA =================
  const loadEntities = useCallback(async () => {
    if (!isOwnerUser) return;
    try {
      const res = await fetch("/api/master-data/legal-entities", {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json().catch(() => ({}))) as {
        items?: Array<{ id?: string; company_name?: string; name?: string }>;
        data?: Array<{ id?: string; company_name?: string; name?: string }>;
      };
      const rows = Array.isArray(json.items)
        ? json.items
        : Array.isArray(json.data)
          ? json.data
          : [];
      setEntities(
        rows
          .map((r) => ({
            id: String(r.id || "").trim(),
            company_name: String(r.company_name || r.name || "").trim() || String(r.id || ""),
          }))
          .filter((r) => r.id),
      );
    } catch {
      setEntities([]);
    }
  }, [isOwnerUser]);

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    void loadEntities();

    const fetchProfiles = async () => {
      setLoading(true);
      setListError(null);
      try {
        const items = await hrApiListEmployees(
          isOwnerUser ? { companyId: ownerEntityFilter || "all" } : undefined,
        );
        if (!isMounted) return;

        setProfiles(
          items.map((item) => ({
            id: item.id,
            userId: item.userId || null,
            name: item.name || "-",
            position: String(item.position ?? "").trim(),
            email: item.email || "-",
            dashboardAccess: Boolean(item.dashboardAccess),
            status: item.status || "inactive",
            leaveBookingsQuota: Number(item.leaveBookingsQuota) || getMaxBookingsPerMonth(),
            requireCheckinSelfie: Boolean(item.requireCheckinSelfie),
          })),
        );
      } catch (err) {
        console.error("FETCH ERROR:", err);
        if (!isMounted) return;
        setProfiles([]);
        setListError(err instanceof Error ? err.message : "Gagal memuat daftar karyawan.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchProfiles();

    return () => {
      isMounted = false;
    };
  }, [hasAccess, t, isOwnerUser, ownerEntityFilter, loadEntities]);

  // 🔒 GUARD
  if (!hasAccess) {
    return (
      <div className="p-6 text-red-500">
        {t("hr.common.noAccess")}
      </div>
    );
  }

  // ================= LOADING =================
  if (loading && profiles.length === 0) {
    return (
      <div className="p-6 text-slate-500">
        {t("hr.employees.loading")}
      </div>
    );
  }

  // ================= UI =================
  return (
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            {t("hr.employees.title")}
          </h1>
          <p className="text-sm text-slate-500">
            {isOwnerUser
              ? "Daftar mengikuti keanggotaan entitas (bukan pohon struktur organisasi). Filter satu entitas untuk melihat anggota di entitas itu saja."
              : t("hr.employees.subtitleHr")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isOwnerUser ? (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Entitas
              <select
                value={ownerEntityFilter}
                onChange={(e) => setOwnerEntityFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Semua entitas</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.company_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {hasAccess && canAccessEmployeeCreate(currentUser as Record<string, unknown> | null) && (
            <button
              onClick={() => router.push("/hr/employees/new")}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition"
            >
              {t("hr.employees.add")}
            </button>
          )}
        </div>
      </div>

      {listError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError}
        </div>
      ) : null}

      {/* TABLE */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-slate-900">
          <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-800">
            <tr>
              <th className="px-6 py-3 text-left">{t("hr.employees.colName")}</th>
              <th className="px-6 py-3 text-left">{t("hr.employees.colEmail")}</th>
              <th className="px-6 py-3 text-left">{t("hr.employees.colPosition")}</th>
              <th className="px-6 py-3 text-center">{t("hr.employees.colSelfie")}</th>
              <th className="px-6 py-3 text-left">{t("hr.employees.colLeaveQuota")}</th>
              <th className="px-6 py-3 text-center">{t("hr.employees.colDashboard")}</th>
              <th className="px-6 py-3 text-left">{t("hr.employees.colStatus")}</th>
              <th className="px-6 py-3 text-right">{t("hr.employees.colActions")}</th>
            </tr>
          </thead>

          <tbody>
            {profiles.map((profile) => {
              const canToggleStatus = canActivate || canDeactivate;

              return (
                <tr
                  key={profile.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {profile.name}
                  </td>

                  <td className="px-6 py-4 text-slate-800">
                    {profile.email}
                  </td>

                  <td className="px-6 py-4 text-slate-800">
                    {profile.position || ""}
                  </td>

                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-block rounded-lg px-2 py-1 text-xs font-semibold ${
                        profile.requireCheckinSelfie
                          ? "bg-amber-100 text-amber-900"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {profile.requireCheckinSelfie ? t("hr.common.yes") : t("hr.common.no")}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <span className="font-semibold text-slate-800">
                      {formatIntegerId(profile.leaveBookingsQuota)}×
                    </span>
                    <span className="block text-xs text-slate-500">{t("hr.employees.bookingPerMonth")}</span>
                  </td>

                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-block rounded-lg px-2 py-1 text-xs font-semibold ${
                        profile.dashboardAccess
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {profile.dashboardAccess ? t("hr.common.yes") : t("hr.common.no")}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <button
                      disabled={!canToggleStatus || !profile.userId}
                      onClick={() => toggleStatus(profile)}
                      className={`px-3 py-1 rounded-lg text-xs ${
                        profile.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      } ${
                        !canToggleStatus || !profile.userId
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      }`}
                    >
                      {profile.status === "active"
                        ? t("hr.common.active")
                        : t("hr.common.inactive")}
                    </button>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => {
                        if (!profile.userId) {
                          alert(t("hr.common.invalidUser"));
                          return;
                        }
                        router.push(`/hr/employees/${profile.userId}`);
                      }}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {t("hr.common.viewDetail")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {profiles.length === 0 && !loading ? (
          <div className="space-y-1 px-6 py-12 text-center text-sm text-slate-600">
            <p className="font-medium">
              {listError
                ? "Daftar tidak dapat dimuat."
                : ownerEntityFilter
                  ? `Tidak ada karyawan dengan keanggotaan di ${
                      entities.find((e) => e.id === ownerEntityFilter)?.company_name ||
                      "entitas ini"
                    }.`
                  : t("hr.employees.empty")}
            </p>
            {isOwnerUser && ownerEntityFilter && !listError ? (
              <p className="text-xs text-slate-500">
                Struktur organisasi terpisah dari keanggotaan. Karyawan di entitas lain tidak
                otomatis muncul di sini — tambahkan keanggotaan / onboard ke entitas ini.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        {t("hr.employees.quotaNote", {
          field: PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD,
          default: String(getMaxBookingsPerMonth()),
        })}
      </p>
      <p className="text-xs text-slate-500">
        {t("hr.employees.emailNote")}
      </p>
    </div>
  );
}
