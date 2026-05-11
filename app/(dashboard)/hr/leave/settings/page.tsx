"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { DIVISION_OPTIONS } from "@/lib/hr-employee-options";
import { Building2, Loader2, Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface DivisionQuota {
  id: string;
  division: string;
  max_people_per_day: number;
}

export default function DivisionQuotaSettingsPage() {
  const router = useRouter();
  const [quotas, setQuotas] = useState<DivisionQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newQuota, setNewQuota] = useState({
    division: "",
    max_people_per_day: 2,
  });

  const currentUser = pb.authStore.model;
  const hasAccess = !!currentUser && (currentUser.role === "hr" || currentUser.role === "owner");

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    fetchQuotas();
  }, [hasAccess]);

  const fetchQuotas = async () => {
    setLoading(true);
    try {
      const result = await pb.collection("division_quotas").getFullList({
        sort: "division",
        requestKey: null,
      });
      setQuotas(result as unknown as DivisionQuota[]);
    } catch (err) {
      console.error("Fetch quotas error:", err);
      setError("Gagal memuat data. Pastikan collection 'division_quotas' sudah dibuat di PocketBase.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!newQuota.division.trim()) {
      setError("Nama division wajib diisi");
      return;
    }

    if (newQuota.max_people_per_day < 1) {
      setError("Minimal 1 orang per hari");
      return;
    }

    // Check if division already exists
    const exists = quotas.some(
      (q) => q.division.toLowerCase() === newQuota.division.toLowerCase()
    );

    if (exists) {
      setError("Division sudah ada dalam daftar");
      return;
    }

    setSaving("new");
    try {
      await pb.collection("division_quotas").create(newQuota);
      setSuccess("Division quota berhasil ditambahkan");
      setNewQuota({ division: "", max_people_per_day: 2 });
      await fetchQuotas();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan division quota");
    } finally {
      setSaving(null);
    }
  };

  const handleUpdate = async (quotaId: string, maxPeople: number) => {
    if (maxPeople < 1) {
      alert("Minimal 1 orang per hari");
      return;
    }

    setSaving(quotaId);
    setError("");
    setSuccess("");

    try {
      await pb.collection("division_quotas").update(quotaId, {
        max_people_per_day: maxPeople,
      });
      setSuccess("Division quota berhasil diupdate");
      await fetchQuotas();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal mengupdate division quota");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (quotaId: string, division: string) => {
    if (!confirm(`Hapus quota untuk division "${division}"?`)) return;

    setSaving(quotaId);
    setError("");
    setSuccess("");

    try {
      await pb.collection("division_quotas").delete(quotaId);
      setSuccess("Division quota berhasil dihapus");
      await fetchQuotas();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menghapus division quota");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Guard: Only HR & Owner
  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          ❌ Akses ditolak. Halaman ini hanya untuk HR dan Owner.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/hr/leave")}
          className="p-2 hover:bg-slate-100 rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">⚙️ Division Quota Settings</h1>
          <p className="text-slate-500 mt-1">Atur maksimal orang cuti per division per hari</p>
        </div>
      </div>

      {/* INFO BANNER */}
      <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-orange-900 mb-1">📋 Cara Kerja Division Quota</p>
            <ul className="text-sm text-orange-700 space-y-1">
              <li>• Division quota membatasi jumlah maksimal orang yang bisa cuti bersamaan dari division yang sama</li>
              <li>• Jika tidak ada setting untuk division tertentu, default adalah 2 orang per hari</li>
              <li>• Validasi dilakukan otomatis saat staff melakukan booking cuti</li>
              <li>• Setting ini tidak berlaku retroaktif (hanya untuk booking baru)</li>
              <li>
                • Nama divisi dipilih dari daftar yang sama dengan field <strong>Divisi</strong> di detail
                karyawan — pastikan sama persis dengan isian profil
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ERROR/SUCCESS ALERTS */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Berhasil!</p>
            <p className="text-sm">{success}</p>
          </div>
        </div>
      )}

      {/* ADD NEW QUOTA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-indigo-600" />
          Tambah Division Quota Baru
        </h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <select
            value={newQuota.division}
            onChange={(e) =>
              setNewQuota({ ...newQuota, division: e.target.value })
            }
            className="flex-1 min-w-0 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-800"
            required
          >
            <option value="" disabled>
              Pilih divisi…
            </option>
            {DIVISION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="10"
            value={newQuota.max_people_per_day}
            onChange={(e) =>
              setNewQuota({ ...newQuota, max_people_per_day: parseInt(e.target.value) })
            }
            className="w-32 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-center"
            required
          />
          <button
            type="submit"
            disabled={saving === "new"}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving === "new" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Tambah
              </>
            )}
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Divisi sama dengan opsi di manajemen karyawan (profil → Divisi); isi juga kuota orang per hari.
        </p>
      </div>

      {/* EXISTING QUOTAS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-600" />
          Division Quotas ({quotas.length})
        </h2>

        {quotas.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">Belum ada division quota</p>
            <p className="text-sm text-slate-400">
              Tambahkan division quota untuk mengatur kuota cuti per division
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {quotas.map((quota) => (
              <div
                key={quota.id}
                className="border border-slate-200 rounded-xl p-4 hover:border-indigo-200 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{quota.division}</p>
                      <p className="text-sm text-slate-500">
                        Max {quota.max_people_per_day} orang per hari
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={quota.max_people_per_day}
                      onChange={(e) => handleUpdate(quota.id, parseInt(e.target.value))}
                      className="w-20 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-center"
                      disabled={saving === quota.id}
                    />
                    <button
                      onClick={() => handleDelete(quota.id, quota.division)}
                      disabled={saving === quota.id}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Hapus"
                    >
                      {saving === quota.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DEFAULT INFO */}
      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800 mb-2">ℹ️ Default Setting:</p>
        <p>
          Division yang <strong>tidak ada</strong> dalam daftar di atas akan menggunakan
          default: <strong className="text-orange-600">maksimal 2 orang per hari</strong>.
        </p>
      </div>
    </div>
  );
}
