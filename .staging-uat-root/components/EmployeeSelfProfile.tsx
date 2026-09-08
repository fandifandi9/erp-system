"use client";

import { useState, useEffect, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import Image from "next/image";
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
  Briefcase,
  Wallet,
  Shield,
  Layers,
  KeyRound,
} from "lucide-react";
import { ensureAndSyncProfile, syncUserDataToProfile } from "@/lib/profile";
import { normalizeAuthModel } from "@/lib/rbac";
import { getErrorMessage } from "@/lib/errors";
import { blurActiveElement } from "@/lib/blur-active-input";

function roleLabelStaff(user: Record<string, unknown> | null | undefined): string {
  if (!user) return "-";
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "Owner";
  const map: Record<string, string> = {
    hr: "SDM / HR",
    manager: "Manajer",
    staff: "Staff",
    "staff-basic": "Staff",
    security: "Satpam",
    ob: "OB / Kebersihan",
  };
  const code = auth.roleCode;
  if (code && map[code]) return map[code];
  const raw = ((user.role_code as string) || (user.role as string) || "").toString().toLowerCase();
  return map[raw] || (user.role_code as string) || (user.role as string) || "-";
}

type StaffProfile = {
  id: string;
  avatar?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  bio?: string;
  division?: string;
  department?: string;
  position?: string;
  salary?: number;
  join_date?: string;
};

function formatJoinDateId(raw: string | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** Profil diri sendiri — dipakai di `/profile` (luar dashboard) dan bisa direuse. */
export function EmployeeSelfProfile() {
  const currentUser = pb.authStore.model;
  const currentUserId = currentUser?.id;

  const [profile, setProfile] = useState<StaffProfile | null>(null);
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

  const [passwordOld, setPasswordOld] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const loadProfile = useCallback(async () => {
    if (!currentUserId) return;

    setLoading(true);
    try {
      const synced = await ensureAndSyncProfile(currentUserId);
      const profileData = synced.profile;
      if (!profileData) {
        setProfile(null);
        return;
      }

      setProfile(profileData as unknown as StaffProfile);
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
  }, [currentUserId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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
      const fd = new FormData();
      fd.append("avatar", file);

      const updated = await pb.collection("profiles").update(profile.id, fd);
      setProfile(updated as unknown as StaffProfile);
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
      blurActiveElement();
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;

    setPasswordError("");
    setPasswordSuccess("");

    if (passwordNew.length < 8) {
      setPasswordError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordError("Konfirmasi kata sandi baru tidak sama.");
      return;
    }
    if (!passwordOld.trim()) {
      setPasswordError("Isi kata sandi saat ini (dari Owner/HR).");
      return;
    }

    setPasswordSaving(true);
    try {
      await pb.collection("users").update(currentUserId, {
        oldPassword: passwordOld,
        password: passwordNew,
        passwordConfirm: passwordNew,
      });
      setPasswordSuccess("Kata sandi berhasil diubah. Gunakan sandi baru saat login berikutnya.");
      setPasswordOld("");
      setPasswordNew("");
      setPasswordConfirm("");
      setTimeout(() => setPasswordSuccess(""), 6000);
    } catch (err: unknown) {
      setPasswordError(getErrorMessage(err, "Gagal mengubah kata sandi. Periksa sandi lama atau rule PocketBase."));
    } finally {
      blurActiveElement();
      setPasswordSaving(false);
    }
  };

  const getAvatarUrl = () => {
    if (!profile || !profile.avatar) {
      return null;
    }
    return pb.files.getURL(profile, profile.avatar, { thumb: "200x200" });
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          Profil tidak ditemukan. Silakan hubungi HR.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Profil saya</h1>
        <p className="mt-1 text-slate-500">Kelola informasi profil dan avatar Anda</p>
      </div>

      {success && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700">
          <CheckCircle className="h-5 w-5" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-center">
              <div className="relative inline-block">
                {getAvatarUrl() ? (
                  <Image
                    src={getAvatarUrl()!}
                    alt="Avatar"
                    width={128}
                    height={128}
                    className="h-32 w-32 rounded-full border-4 border-indigo-100 object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-indigo-100 bg-gradient-to-br from-indigo-100 to-purple-100">
                    <User className="h-16 w-16 text-indigo-600" />
                  </div>
                )}

                <label
                  htmlFor="avatar-upload-global"
                  className="absolute bottom-0 right-0 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-indigo-600 shadow-lg transition hover:bg-indigo-700"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </label>
                <input
                  id="avatar-upload-global"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={uploadingAvatar}
                />
              </div>

              <h2 className="mt-4 text-xl font-bold text-slate-800">{currentUser?.name || "Pengguna"}</h2>
              <p className="text-sm text-slate-500">{currentUser?.email}</p>

              <div className="mt-5 border-t border-slate-200 pt-5 text-left">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Data kepegawaian</p>
                <p className="mb-4 text-[11px] leading-relaxed text-slate-400">Informasi ini hanya dapat diubah oleh HR.</p>
                <ul className="space-y-3">
                  <li className="flex gap-3 text-sm">
                    <Layers className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Divisi</p>
                      <p className="break-words font-medium leading-snug text-slate-800">{profile.division?.trim() || "—"}</p>
                    </div>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Departemen</p>
                      <p className="break-words font-medium leading-snug text-slate-800">{profile.department?.trim() || "—"}</p>
                    </div>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Jabatan</p>
                      <p className="break-words font-medium leading-snug text-slate-800">{profile.position?.trim() || "—"}</p>
                    </div>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Gaji pokok</p>
                      <p className="font-medium leading-snug text-slate-800">
                        {profile.salary != null && Number(profile.salary) > 0
                          ? `Rp ${Number(profile.salary).toLocaleString("id-ID")}`
                          : "—"}
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Peran akun</p>
                      <p className="font-medium leading-snug text-slate-800">
                        {roleLabelStaff(currentUser as unknown as Record<string, unknown>)}
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Tanggal bergabung</p>
                      <p className="font-medium leading-snug text-slate-800">{formatJoinDateId(profile.join_date)}</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
            <p className="mb-2 text-sm font-medium text-blue-800">Tips</p>
            <ul className="space-y-1 text-xs text-blue-700">
              <li>• Ukuran foto maksimal 5MB</li>
              <li>• Format: JPG, PNG, atau GIF</li>
              <li>• Update biodata secara berkala</li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-2">
              <h3 className="text-lg font-semibold text-slate-800">Informasi personal</h3>
              <p className="mt-1 text-xs text-slate-500">Hanya bagian ini yang bisa Anda ubah sendiri.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                <Phone className="mr-2 inline h-4 w-4" />
                Nomor Telepon
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="08123456789"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                <MapPin className="mr-2 inline h-4 w-4" />
                Alamat
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={3}
                placeholder="Masukkan alamat lengkap..."
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                <Calendar className="mr-2 inline h-4 w-4" />
                Tanggal Lahir
              </label>
              <input
                type="date"
                name="date_of_birth"
                value={formData.date_of_birth}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Bio / Tentang Saya</label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                rows={4}
                placeholder="Ceritakan tentang diri Anda..."
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-500">{formData.bio.length} karakter</p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5" />
                    Simpan Perubahan
                  </>
                )}
              </button>
            </div>
          </form>

          <form
            onSubmit={handlePasswordSubmit}
            className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-2 flex items-start gap-2">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Ubah kata sandi</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Setelah Owner membuat akun dengan sandi standar, Anda bisa menggantinya di sini. Sandi baru minimal 8
                  karakter.
                </p>
              </div>
            </div>

            {passwordSuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                <CheckCircle className="h-4 w-4 shrink-0" />
                {passwordSuccess}
              </div>
            )}
            {passwordError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {passwordError}
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-800">Kata sandi saat ini</label>
              <input
                type="password"
                autoComplete="current-password"
                value={passwordOld}
                onChange={(e) => setPasswordOld(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                placeholder="Sandi dari Owner / HR"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-800">Kata sandi baru</label>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordNew}
                onChange={(e) => setPasswordNew(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                placeholder="Minimal 8 karakter"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-800">Ulangi kata sandi baru</label>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                placeholder="Sama dengan di atas"
              />
            </div>

            <button
              type="submit"
              disabled={passwordSaving}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-sm font-semibold text-indigo-900 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {passwordSaving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Menyimpan…
                </>
              ) : (
                <>
                  <KeyRound className="h-5 w-5" />
                  Simpan kata sandi baru
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
