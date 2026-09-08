"use client";

/**
 * Profil khusus Mobile Companion — vibe gelap/sky, layout tablet, bukan ERP desktop.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Camera, KeyRound, Save } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import {
  fetchSelfProfileApi,
  patchSelfProfileApi,
  resolveSelfAvatarPreviewUrl,
  uploadSelfAvatarApi,
  type SelfProfileData,
} from "@/lib/profile-self-api";
import { getErrorMessage, isPocketBaseAuthError } from "@/lib/errors";
import { blurActiveElement } from "@/lib/blur-active-input";
import { useLocale } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { EmployeePrivateDocumentsPanel } from "@/components/profile/EmployeePrivateDocumentsSection";
import { PayrollBankAccountSection } from "@/components/profile/PayrollBankAccountSection";
import { UserAvatar } from "@/components/UserAvatar";
import { Button, Input, Textarea, useToast } from "@/components/ui";

type ProfileTab = "ringkasan" | "pribadi" | "dokumen" | "keamanan";

const TAB_DEFS: { id: ProfileTab; legacyHashes: string[] }[] = [
  { id: "ringkasan", legacyHashes: [] },
  { id: "pribadi", legacyHashes: [] },
  { id: "dokumen", legacyHashes: ["dokumen-pribadi"] },
  { id: "keamanan", legacyHashes: ["keamanan-slip-gaji"] },
];

function roleLabelFromEmployment(
  employment: SelfProfileData["employment"],
  t: ReturnType<typeof import("@/lib/i18n").createTranslator>,
): string {
  if (employment.account_type === "owner") return t("hr.profile.self.roles.owner");
  const map: Record<string, string> = {
    hr: t("hr.profile.self.roles.hr"),
    manager: t("hr.profile.self.roles.manager"),
    staff: t("hr.profile.self.roles.staff"),
    "staff-basic": t("hr.profile.self.roles.staff"),
    security: t("hr.profile.self.roles.security"),
    ob: t("hr.profile.self.roles.ob"),
  };
  return map[employment.role_code ?? ""] || employment.role_code || "—";
}

function formatJoinDate(raw: string | undefined, locale: "id" | "en"): string {
  if (!raw?.trim()) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function displayOrDash(value: string | undefined | null): string {
  return value?.trim() ? value.trim() : "—";
}

function resolveTabFromHash(): ProfileTab {
  if (typeof window === "undefined") return "ringkasan";
  const h = window.location.hash.replace("#", "").trim();
  if (!h) return "ringkasan";
  for (const tab of TAB_DEFS) {
    if (tab.id === h || tab.legacyHashes.includes(h)) return tab.id;
  }
  return "ringkasan";
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-800/90 py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <span className="min-w-0 break-words text-sm font-medium leading-snug text-slate-100 sm:text-right">
        {value}
      </span>
    </div>
  );
}

function SoftPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/70 ${className}`}>{children}</div>
  );
}

export function MobileCompanionProfile() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const currentUser = pb.authStore.model;

  const [profile, setProfile] = useState<SelfProfileData | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState("");
  const [tab, setTab] = useState<ProfileTab>("ringkasan");

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [formData, setFormData] = useState({ phone: "", address: "", date_of_birth: "", bio: "" });

  const [passwordOld, setPasswordOld] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const tabItems = useMemo(
    () => [
      { id: "ringkasan" as const, label: t("profile.tabs.ringkasan") },
      { id: "pribadi" as const, label: t("profile.tabs.pribadi") },
      { id: "dokumen" as const, label: t("profile.tabs.dokumen") },
      { id: "keamanan" as const, label: t("profile.tabs.keamanan") },
    ],
    [t],
  );

  const showToast = useCallback(
    (kind: "success" | "error", title: string, detail?: string) => {
      toast({ tone: kind === "success" ? "success" : "error", title, detail });
    },
    [toast],
  );

  const applyProfile = useCallback((data: SelfProfileData) => {
    setProfile(data);
    setAvatarPreview(resolveSelfAvatarPreviewUrl(data));
    setFormData({
      phone: data.phone || "",
      address: data.address || "",
      date_of_birth: data.date_of_birth || "",
      bio: data.bio || "",
    });
  }, []);

  const loadProfile = useCallback(async () => {
    if (!pb.authStore.isValid) return;
    setLoading(true);
    setProfileLoadError("");
    try {
      applyProfile(await fetchSelfProfileApi());
    } catch (err) {
      setProfile(null);
      setProfileLoadError(
        isPocketBaseAuthError(err)
          ? t("hr.profile.self.loginAgain")
          : getErrorMessage(err, "Gagal memuat profil."),
      );
    } finally {
      setLoading(false);
    }
  }, [applyProfile, t]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setTab(resolveTabFromHash());
    const onHash = () => setTab(resolveTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigateTab = (id: ProfileTab) => {
    setTab(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (!file.type.startsWith("image/")) {
      showToast("error", t("hr.profile.self.avatarInvalid"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", t("hr.profile.self.avatarTooLarge"));
      return;
    }
    setUploadingAvatar(true);
    try {
      applyProfile(await uploadSelfAvatarApi(file));
      showToast("success", t("hr.profile.self.avatarUpdated"));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Gagal upload avatar");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const handleAvatarDelete = async () => {
    if (!profile?.avatar || !window.confirm("Hapus foto profil?")) return;
    setUploadingAvatar(true);
    try {
      applyProfile(await uploadSelfAvatarApi(null));
      showToast("success", "Foto profil dihapus");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Gagal menghapus foto");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePersonalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      applyProfile(await patchSelfProfileApi(formData));
      showToast("success", t("hr.profile.self.profileUpdated"));
    } catch (err) {
      showToast("error", t("profile.saveError"), getErrorMessage(err));
    } finally {
      blurActiveElement();
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordNew.length < 8) {
      showToast("error", t("hr.profile.self.passwordMin"));
      return;
    }
    if (passwordNew !== passwordConfirm) {
      showToast("error", t("hr.profile.self.passwordMismatch"));
      return;
    }
    if (!passwordOld.trim()) {
      showToast("error", t("hr.profile.self.passwordCurrentRequired"));
      return;
    }
    setPasswordSaving(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
      const res = await fetch("/api/profile/self/password", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          oldPassword: passwordOld,
          password: passwordNew,
          passwordConfirm: passwordNew,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error || "Gagal mengubah kata sandi.");
      setPasswordOld("");
      setPasswordNew("");
      setPasswordConfirm("");
      showToast("success", t("hr.profile.self.passwordChangedHint"));
    } catch (err) {
      showToast("error", getErrorMessage(err, "Gagal mengubah kata sandi."));
    } finally {
      blurActiveElement();
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">
        {t("design.loading")}
      </div>
    );
  }

  if (!profile) {
    return (
      <SoftPanel className="p-5 text-sm text-rose-200">
        <p className="font-semibold text-rose-100">{t("hr.profile.self.loadErrorTitle")}</p>
        <p className="mt-1 text-slate-400">{profileLoadError}</p>
      </SoftPanel>
    );
  }

  const employment = profile.employment;
  const primary = employment.primary_entity;
  const salaryText =
    employment.salary != null && employment.salary > 0
      ? `Rp ${employment.salary.toLocaleString(locale === "en" ? "en-US" : "id-ID")}`
      : "—";
  const roleLabel = roleLabelFromEmployment(employment, t);

  return (
    <div className="space-y-5 text-slate-100">
      <SoftPanel className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/40 p-5 sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <UserAvatar
              name={profile.name || String(currentUser?.name ?? "User")}
              src={avatarPreview}
              size={88}
              className="border-2 border-slate-700 ring-2 ring-sky-500/20"
            />
            <label
              htmlFor="companion-avatar-upload"
              className={`absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-slate-950 shadow ${
                uploadingAvatar ? "pointer-events-none opacity-70" : "cursor-pointer hover:bg-sky-400"
              }`}
              title={t("hr.profile.self.changeAvatar")}
            >
              <Camera className="h-4 w-4" aria-hidden />
              <span className="sr-only">{t("hr.profile.self.changeAvatar")}</span>
            </label>
            <input
              ref={avatarInputRef}
              id="companion-avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadingAvatar}
              onChange={handleAvatarUpload}
            />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {profile.name || String(currentUser?.name ?? t("hr.profile.self.userLabel"))}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{profile.email || String(currentUser?.email ?? "")}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-300">
                {roleLabel}
              </span>
              <span className="max-w-full break-words rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {primary.label}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-500/40 disabled:opacity-60"
              >
                {t("profile.changePhoto")}
              </button>
              {profile.avatar ? (
                <button
                  type="button"
                  onClick={() => void handleAvatarDelete()}
                  disabled={uploadingAvatar}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 hover:border-rose-400/50 disabled:opacity-60"
                >
                  {t("profile.removePhoto")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </SoftPanel>

      <SoftPanel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-sm font-semibold text-slate-100">{t("profile.preferences.title")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("profile.preferences.languageDesc")}</p>
        </div>
        <LanguageSwitcher variant="erp" />
      </SoftPanel>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50 p-1">
        {tabItems.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateTab(item.id)}
              className={`shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "ringkasan" ? (
        <SoftPanel className="p-5 sm:p-6">
          <p className="text-base font-semibold text-white">{t("hr.profile.self.employmentTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("hr.profile.self.employmentHint")}</p>
          <div className="mt-2">
            <FactRow label={t("hr.profile.self.userLabel")} value={displayOrDash(profile.name)} />
            <FactRow label={t("hr.profile.self.adminEntity")} value={primary.label} />
            <FactRow label={t("hr.profile.self.division")} value={displayOrDash(employment.division)} />
            <FactRow label={t("hr.profile.self.department")} value={displayOrDash(employment.department)} />
            <FactRow label={t("hr.profile.self.position")} value={displayOrDash(employment.position)} />
            <FactRow label={t("hr.profile.self.role")} value={roleLabel} />
            <FactRow label={t("hr.profile.self.joinDate")} value={formatJoinDate(employment.join_date, locale)} />
            <FactRow label={t("hr.profile.self.salary")} value={salaryText} />
          </div>
        </SoftPanel>
      ) : null}

      {tab === "pribadi" ? (
        <div className="space-y-4">
          <SoftPanel className="p-5 sm:p-6">
            <p className="text-base font-semibold text-white">{t("hr.profile.self.personalTitle")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("hr.profile.self.personalHint")}</p>
            <form onSubmit={handlePersonalSubmit} className="mt-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">{t("hr.profile.self.dateOfBirth")}</span>
                <Input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData((f) => ({ ...f, date_of_birth: e.target.value }))}
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">{t("hr.profile.self.bio")}</span>
                <Textarea
                  value={formData.bio}
                  onChange={(e) => setFormData((f) => ({ ...f, bio: e.target.value }))}
                  rows={3}
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">{t("hr.profile.self.phone")}</span>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">{t("hr.profile.self.address")}</span>
                <Textarea
                  value={formData.address}
                  onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                  rows={2}
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </label>
              <Button type="submit" loading={saving} className="w-full bg-sky-500 text-slate-950 hover:bg-sky-400 sm:w-auto">
                <Save className="h-4 w-4" aria-hidden />
                {saving ? t("profile.saving") : t("hr.profile.self.saveProfile")}
              </Button>
            </form>
          </SoftPanel>
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-white text-slate-900">
            <div className="p-4">
              <PayrollBankAccountSection onToast={showToast} />
            </div>
          </div>
        </div>
      ) : null}

      {tab === "dokumen" ? (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-white text-slate-900">
          <div className="p-4">
            <EmployeePrivateDocumentsPanel />
          </div>
        </div>
      ) : null}

      {tab === "keamanan" ? (
        <SoftPanel className="p-5 sm:p-6">
          <p className="text-base font-semibold text-white">{t("hr.profile.self.accountTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("hr.profile.self.accountHint")}</p>
          <label className="mt-4 block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">{t("profile.emailLogin")}</span>
            <Input
              type="email"
              disabled
              value={profile.email || ""}
              readOnly
              className="border-slate-700 bg-slate-950 text-slate-300"
            />
          </label>
          <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4 border-t border-slate-800 pt-5">
            <div>
              <p className="text-sm font-semibold text-slate-100">{t("hr.profile.self.passwordTitle")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("hr.profile.self.passwordDesc")}</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">{t("hr.profile.self.passwordOld")}</span>
              <Input
                type="password"
                autoComplete="current-password"
                value={passwordOld}
                onChange={(e) => setPasswordOld(e.target.value)}
                className="border-slate-700 bg-slate-950 text-slate-100"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">{t("hr.profile.self.passwordNew")}</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passwordNew}
                  onChange={(e) => setPasswordNew(e.target.value)}
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">{t("hr.profile.self.passwordConfirm")}</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </label>
            </div>
            <Button
              type="submit"
              loading={passwordSaving}
              className="w-full bg-sky-500 text-slate-950 hover:bg-sky-400 sm:w-auto"
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              {passwordSaving ? t("profile.saving") : t("hr.profile.self.passwordSave")}
            </Button>
          </form>
        </SoftPanel>
      ) : null}
    </div>
  );
}
