"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { pb } from "@/lib/pocketbase";
import { ensureAndSyncProfile, syncUserDataToProfile } from "@/lib/profile";
import { canAccess } from "@/lib/rbac";
import {
  User,
  Phone,
  MapPin,
  Building2,
  Calendar,
  Camera,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

type HrProfile = {
  id: string;
  avatar?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  bio?: string;
  division?: string;
  position?: string;
  salary?: number;
  join_date?: string;
};

export default function HrProfilePage() {
  const currentUser = pb.authStore.model;
  const currentUserId = currentUser?.id;
  const hasAccess = !!currentUser && canAccess(currentUser, "/hr/profile");

  const [profile, setProfile] = useState<HrProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    phone: "",
    address: "",
    date_of_birth: "",
    bio: "",
  });

  const loadProfile = useCallback(async () => {
    if (!currentUserId || !hasAccess) return;

    setLoading(true);
    try {
      const synced = await ensureAndSyncProfile(currentUserId);
      const profileData = synced.profile;

      if (!profileData) {
        setProfile(null);
        return;
      }

      setProfile(profileData as unknown as HrProfile);
      setFormData({
        phone: profileData.phone || "",
        address: profileData.address || "",
        date_of_birth: profileData.date_of_birth || "",
        bio: profileData.bio || "",
      });
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, hasAccess]);

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    loadProfile();
  }, [hasAccess, loadProfile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran file maksimal 5MB");
      return;
    }

    setUploadingAvatar(true);
    setError("");

    try {
      const uploadData = new FormData();
      uploadData.append("avatar", file);

      const updated = await pb.collection("profiles").update(profile.id, uploadData);
      setProfile(updated as unknown as HrProfile);
      setSuccess("Avatar berhasil diupdate!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await pb.collection("profiles").update(profile.id, formData);
      if (currentUserId) {
        await syncUserDataToProfile(currentUserId);
      }
      setSuccess("Profil berhasil diupdate!");
      await loadProfile();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal update profil");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const getAvatarUrl = () => {
    if (!profile || !profile.avatar) return null;
    return pb.files.getURL(profile, profile.avatar, { thumb: "200x200" });
  };

  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          ❌ Akses ditolak. Halaman ini hanya untuk HR dan Owner.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          Profil tidak ditemukan. Silakan hubungi admin sistem.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Profil HR</h1>
        <p className="text-slate-500 mt-1">Kelola informasi profil dan avatar Anda</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="text-center">
              <div className="relative inline-block">
                {getAvatarUrl() ? (
                  <Image
                    src={getAvatarUrl()!}
                    alt="Avatar"
                    width={128}
                    height={128}
                    className="w-32 h-32 rounded-full object-cover border-4 border-indigo-100"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center border-4 border-indigo-100">
                    <User className="w-16 h-16 text-indigo-600" />
                  </div>
                )}

                <label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition shadow-lg"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={uploadingAvatar}
                />
              </div>

              <h2 className="text-xl font-bold text-slate-800 mt-4">
                {currentUser?.name || "User"}
              </h2>
              <p className="text-sm text-slate-500">{currentUser?.email}</p>

              <div className="mt-4 pt-4 border-t border-slate-200 text-left space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span className="font-medium">Division:</span>
                  <span>{profile.division || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span className="font-medium">Position:</span>
                  <span>{profile.position || "-"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Informasi Personal</h3>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Phone className="w-4 h-4 inline mr-2" />
                Nomor Telepon
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="08123456789"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <MapPin className="w-4 h-4 inline mr-2" />
                Alamat
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={3}
                placeholder="Masukkan alamat lengkap..."
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Tanggal Lahir
              </label>
              <input
                type="date"
                name="date_of_birth"
                value={formData.date_of_birth}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Bio / Tentang Saya
              </label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                rows={4}
                placeholder="Ceritakan tentang diri Anda..."
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-slate-700 mb-2">Informasi HR (Read-Only)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Role:</span>
                  <p className="font-medium text-slate-800">{currentUser?.role || "-"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Position:</span>
                  <p className="font-medium text-slate-800">{profile.position || "-"}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Simpan Perubahan
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
