"use client";

import { pb } from "@/lib/pocketbase";
import {
  getMaxBookingsPerMonth,
  PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD,
  leaveBookingsQuotaFromProfileRecord,
} from "@/lib/leave";
import { formatIntegerId } from "@/lib/format-number";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";

type PbUserRow = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  role_code?: string;
  status?: string;
};

type EmployeeProfile = {
  id: string;
  userId: string | null;
  name: string;
  position: string;
  email: string;
  role: string;
  status: string;
  /** Maks. pengajuan cuti (pending + disetujui) per bulan kalender; dari profil atau default. */
  leaveBookingsQuota: number;
  /** HR: wajib selfie sebelum check-in (app native). */
  requireCheckinSelfie: boolean;
};

function escapePbFilterString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function profileRequiresSelfie(raw: Record<string, unknown>): boolean {
  const v = raw.require_checkin_selfie;
  return (
    v === true ||
    String(v).toLowerCase() === "true" ||
    Number(v) === 1
  );
}

function profileUserId(raw: { user?: unknown }): string | null {
  const u = raw.user;
  if (typeof u === "string" && u.trim()) return u.trim();
  if (u && typeof u === "object" && "id" in u && typeof (u as { id: unknown }).id === "string") {
    return String((u as { id: string }).id).trim() || null;
  }
  return null;
}

async function fetchUsersByIds(ids: string[]): Promise<Map<string, PbUserRow>> {
  const map = new Map<string, PbUserRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  const chunkSize = 25;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const filter = chunk.map((id) => `id="${escapePbFilterString(id)}"`).join("||");
    try {
      const rows = await pb.collection("users").getFullList({
        filter: `(${filter})`,
        fields: "id,email,name,role,role_code,status",
        requestKey: null,
      });
      for (const row of rows) {
        const r = row as unknown as PbUserRow;
        if (r.id) map.set(r.id, r);
      }
    } catch (err) {
      console.error("[hr/employees] fetch users chunk:", err);
    }
  }
  return map;
}

export default function EmployeesPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const currentUser = pb.authStore.model;
  const role = currentUser?.role;
  const hasAccess = role === "owner" || role === "hr";

  // ================= TOGGLE STATUS =================
  const toggleStatus = async (profile: EmployeeProfile) => {
    if (currentUser?.role !== "owner") {
      alert(t("hr.common.ownerOnlyStatus"));
      return;
    }

    if (!profile?.userId) {
      alert(t("hr.common.invalidUser"));
      return;
    }

    try {
      const newStatus =
        profile.status === "active" ? "inactive" : "active";

      await pb.collection("users").update(profile.userId, {
        status: newStatus,
      });

      // update UI
      setProfiles((prev) =>
        prev.map((p) =>
          p.userId === profile.userId
            ? { ...p, status: newStatus }
            : p
        )
      );

      alert(t("hr.common.statusChanged"));
    } catch (err) {
      console.error("TOGGLE ERROR:", err);
      alert(t("hr.common.statusChangeFailed"));
    }
  };

  // ================= FETCH DATA =================
  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchProfiles = async () => {
      try {
        const res = await pb.collection("profiles").getFullList({
          sort: "-updated",
          requestKey: null,
        });

        if (!isMounted) return;

        /** Satu baris per user — profil terbaru (hindari duplikat tampil kuota lama). */
        const latestProfileByUser = new Map<string, (typeof res)[0]>();
        for (const profile of res) {
          const uid = profileUserId(profile as { user?: unknown });
          if (!uid) continue;
          const existing = latestProfileByUser.get(uid);
          if (!existing) {
            latestProfileByUser.set(uid, profile);
            continue;
          }
          const tNew = new Date(String(profile.updated || profile.created || 0)).getTime();
          const tOld = new Date(String(existing.updated || existing.created || 0)).getTime();
          if (tNew >= tOld) latestProfileByUser.set(uid, profile);
        }

        const deduped = [...latestProfileByUser.values()];
        const userIds = deduped.map((p) => profileUserId(p as { user?: unknown })).filter(Boolean) as string[];
        const usersById = await fetchUsersByIds(userIds);
        const defaultQuota = getMaxBookingsPerMonth();

        const combinedData = deduped.map((profile) => {
          const uid = profileUserId(profile as { user?: unknown });
          const u = uid ? usersById.get(uid) : undefined;

          const emailFromProfile = (profile.email as string | undefined)?.trim();
          const emailFromUser = u?.email?.trim();
          const email = emailFromProfile || emailFromUser || "-";

          const pr = profile as Record<string, unknown>;
          const leaveBookingsQuota =
            leaveBookingsQuotaFromProfileRecord(pr) ?? defaultQuota;

          return {
            id: profile.id,
            userId: uid,
            name: (profile.name as string) || u?.name || "-",
            position: (profile.position as string) || "-",
            email,
            role: ((u?.role_code || u?.role || "-") as string).toString(),
            status: u?.status || "inactive",
            leaveBookingsQuota,
            requireCheckinSelfie: profileRequiresSelfie(pr),
          };
        });

        setProfiles(combinedData);
      } catch (err) {
        console.error("FETCH ERROR:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProfiles();

    return () => {
      isMounted = false;
    };
  }, [hasAccess]);

  // 🔒 GUARD
  if (!hasAccess) {
    return (
      <div className="p-6 text-red-500">
        {t("hr.common.noAccess")}
      </div>
    );
  }

  // ================= LOADING =================
  if (loading) {
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
            {role === "owner"
              ? t("hr.employees.subtitleOwner")
              : t("hr.employees.subtitleHr")}
          </p>
        </div>

        {role === "owner" && (
          <button
            onClick={() => router.push("/hr/employees/new")}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition"
          >
            {t("hr.employees.add")}
          </button>
        )}
      </div>

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
              <th className="px-6 py-3 text-left">{t("hr.employees.colRole")}</th>
              <th className="px-6 py-3 text-left">{t("hr.employees.colStatus")}</th>
              <th className="px-6 py-3 text-right">{t("hr.employees.colActions")}</th>
            </tr>
          </thead>

          <tbody>
            {profiles.map((profile) => {
              const isOwner = currentUser?.role === "owner";

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
                    {profile.position}
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

                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-lg text-xs ${
                        profile.role === "owner"
                          ? "bg-purple-100 text-purple-700"
                          : profile.role === "hr"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {profile.role}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <button
                      disabled={!isOwner || !profile.userId}
                      onClick={() => toggleStatus(profile)}
                      className={`px-3 py-1 rounded-lg text-xs ${
                        profile.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      } ${
                        !isOwner || !profile.userId
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

        {profiles.length === 0 && (
          <div className="py-12 text-center text-sm font-medium text-slate-600">
            {t("hr.employees.empty")}
          </div>
        )}
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