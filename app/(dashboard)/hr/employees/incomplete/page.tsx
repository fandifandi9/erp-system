 "use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getIncompleteProfiles, type Profile } from "@/lib/profile";
import { Loader2, AlertTriangle, UserX, Edit } from "lucide-react";

export default function IncompleteProfilesPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getIncompleteProfiles(page, 20);
      setProfiles(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error("Failed to load incomplete profiles:", error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const getMissingFields = (profile: Profile): string[] => {
    const missing: string[] = [];
    if (!profile.position) missing.push("Position");
    if (!profile.department) missing.push("Department");
    if (!profile.salary) missing.push("Salary");
    return missing;
  };

  if (loading && page === 1) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Data Belum Lengkap</h1>
          <p className="text-slate-500 mt-1">
            Karyawan yang belum melengkapi data HR
          </p>
        </div>
        <button
          onClick={() => router.push("/hr/employees")}
          className="px-4 py-2 bg-slate-600 text-white rounded-xl hover:bg-slate-700 transition"
        >
          Kembali ke Data Karyawan
        </button>
      </div>

      {/* STATS CARD */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-center gap-4">
          <AlertTriangle className="w-12 h-12 text-red-600" />
          <div>
            <p className="text-3xl font-bold text-red-800">{profiles.length}</p>
            <p className="text-sm text-red-600">
              Karyawan dengan data belum lengkap
            </p>
          </div>
        </div>
      </div>

      {/* TABLE */}
      {profiles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <UserX className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 mb-2">Semua data karyawan sudah lengkap!</p>
          <p className="text-sm text-slate-400">
            Tidak ada karyawan dengan data yang belum lengkap
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Karyawan
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Data Kurang
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {profiles.map((profile) => {
                  const missing = getMissingFields(profile);
                  return (
                    <tr
                      key={profile.id}
                      className="hover:bg-slate-50 transition"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                            <span className="text-indigo-600 font-semibold">
                              {profile.name?.charAt(0)?.toUpperCase() || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">
                              {profile.name || "No Name"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {profile.department || "-"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {profile.email || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {missing.map((field) => (
                            <span
                              key={field}
                              className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-lg"
                            >
                              {field}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                          ⚠ Belum Lengkap
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() =>
                            router.push(`/hr/employees/${profile.id}/edit`)
                          }
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition"
                        >
                          <Edit className="w-4 h-4" />
                          Lengkapi
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center">
              <p className="text-sm text-slate-600">
                Halaman {page} dari {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* INFO */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-2">📋 Informasi:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Data yang wajib dilengkapi: Position, Department, Salary</li>
          <li>Karyawan tidak dapat menggunakan fitur absensi dan cuti jika data belum lengkap</li>
          <li>Klik &quot;Lengkapi&quot; untuk mengisi data karyawan</li>
        </ul>
      </div>
    </div>
  );
}
