"use client";

import { pb } from "@/lib/pocketbase";
import {
  getMaxBookingsPerMonth,
  PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD,
  parseLeaveBookingsQuotaFromProfile,
} from "@/lib/leave";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
};

function escapePbFilterString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
  const router = useRouter();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const currentUser = pb.authStore.model;
  const role = currentUser?.role;
  const hasAccess = role === "owner" || role === "hr";

  // ================= TOGGLE STATUS =================
  const toggleStatus = async (profile: EmployeeProfile) => {
    if (currentUser?.role !== "owner") {
      alert("Hanya owner yang bisa ubah status");
      return;
    }

    if (!profile?.userId) {
      alert("User tidak valid");
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

      alert("Status berhasil diubah");
    } catch (err) {
      console.error("TOGGLE ERROR:", err);
      alert("Gagal update status");
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
          sort: "-created",
          requestKey: null,
        });

        if (!isMounted) return;

        const userIds = res.map((p) => profileUserId(p as { user?: unknown })).filter(Boolean) as string[];
        const usersById = await fetchUsersByIds(userIds);
        const defaultQuota = getMaxBookingsPerMonth();

        const combinedData = res.map((profile) => {
          const uid = profileUserId(profile as { user?: unknown });
          const u = uid ? usersById.get(uid) : undefined;

          const emailFromProfile = (profile.email as string | undefined)?.trim();
          const emailFromUser = u?.email?.trim();
          const email = emailFromProfile || emailFromUser || "-";

          const rawQuota = (profile as Record<string, unknown>)[PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD];
          const leaveBookingsQuota =
            parseLeaveBookingsQuotaFromProfile(rawQuota) ?? defaultQuota;

          return {
            id: profile.id,
            userId: uid,
            name: (profile.name as string) || u?.name || "-",
            position: (profile.position as string) || "-",
            email,
            role: ((u?.role_code || u?.role || "-") as string).toString(),
            status: u?.status || "inactive",
            leaveBookingsQuota,
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
        Tidak punya akses
      </div>
    );
  }

  // ================= LOADING =================
  if (loading) {
    return (
      <div className="p-6 text-slate-500">
        Loading data karyawan...
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
            Data Karyawan
          </h1>
          <p className="text-sm text-slate-500">
            {role === "owner"
              ? "Kelola seluruh data karyawan perusahaan"
              : "Lihat data karyawan (read-only)"}
          </p>
        </div>

        {role === "owner" && (
          <button
            onClick={() => router.push("/hr/employees/new")}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition"
          >
            Tambah Karyawan
          </button>
        )}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-6 py-3 text-left">Nama</th>
              <th className="px-6 py-3 text-left">Email</th>
              <th className="px-6 py-3 text-left">Posisi</th>
              <th className="px-6 py-3 text-left">Kuota cuti / bulan</th>
              <th className="px-6 py-3 text-left">Role</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-right">Aksi</th>
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
                  <td className="px-6 py-4 font-medium">
                    {profile.name}
                  </td>

                  <td className="px-6 py-4 text-slate-500">
                    {profile.email}
                  </td>

                  <td className="px-6 py-4">
                    {profile.position}
                  </td>

                  <td className="px-6 py-4">
                    <span className="font-semibold text-slate-800">{profile.leaveBookingsQuota}×</span>
                    <span className="block text-xs text-slate-500">booking / bulan</span>
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
                        ? "Aktif"
                        : "Nonaktif"}
                    </button>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => {
                        if (!profile.userId) {
                          alert("User tidak valid");
                          return;
                        }
                        router.push(`/hr/employees/${profile.userId}`);
                      }}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Lihat Detail
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {profiles.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            Belum ada data karyawan
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        <strong>Kuota cuti:</strong> jumlah maksimal pengajuan cuti{" "}
        <strong>pending + disetujui</strong> dalam satu bulan kalender. Ubah nilai default per orang di halaman detail
        karyawan — field PocketBase{" "}
        <code className="rounded bg-slate-100 px-1">{PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD}</code> pada koleksi{" "}
        <code className="rounded bg-slate-100 px-1">profiles</code>{" "}
        (angka ≥ 1); jika belum ada, dipakai batas aplikasi ({getMaxBookingsPerMonth()}×).
      </p>
      <p className="text-xs text-slate-500">
        <strong>Email:</strong> diambil dari akun PocketBase (<code className="rounded bg-slate-100 px-1">users</code>
        ); jika masih kosong, isi kolom tersebut di PocketBase atau pastikan pengguna punya akun lengkap dengan email.
      </p>
    </div>
  );
}