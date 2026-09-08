"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { Camera, KeyRound, Save } from "lucide-react";
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
import { AccountPreferencesPanel } from "@/components/profile/AccountPreferencesPanel";
import { EmployeePrivateDocumentsPanel } from "@/components/profile/EmployeePrivateDocumentsSection";
import { PayrollBankAccountSection } from "@/components/profile/PayrollBankAccountSection";
import { UserAvatar } from "@/components/UserAvatar";
import { PageShell } from "@/components/layout/page-shell";
import {
  ActionBar,
  Button,
  Card,
  CardHeader,
  ErrorState,
  FormField,
  FormSection,
  FormSectionFullWidth,
  Input,
  LoadingState,
  SectionHeader,
  TabPanel,
  Tabs,
  Textarea,
  useToast,
  type TabItem,
} from "@/components/ui";

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

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-erp-border bg-erp-surface-muted/60 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-erp-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-erp-text">{value}</p>
    </div>
  );
}

export function EmployeeSelfProfile() {
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

  const tabItems: TabItem[] = useMemo(
    () => [
      { id: "ringkasan", label: t("profile.tabs.ringkasan") },
      { id: "pribadi", label: t("profile.tabs.pribadi") },
      { id: "dokumen", label: t("profile.tabs.dokumen") },
      { id: "keamanan", label: t("profile.tabs.keamanan") },
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
    const syncTab = () => setTab(resolveTabFromHash());
    syncTab();
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, []);

  const navigateTab = (next: string) => {
    const tabId = next as ProfileTab;
    setTab(tabId);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${tabId}`);
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
      <PageShell maxWidth="max-w-4xl" className="p-4 sm:p-6">
        <LoadingState label={t("design.loading")} className="min-h-[320px] justify-center" />
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell maxWidth="max-w-4xl" className="p-4 sm:p-6">
        <ErrorState title={t("hr.profile.self.loadErrorTitle")} description={profileLoadError} />
      </PageShell>
    );
  }

  const employment = profile.employment;
  const primary = employment.primary_entity;
  const salaryText =
    employment.salary != null && employment.salary > 0
      ? `Rp ${employment.salary.toLocaleString(locale === "en" ? "en-US" : "id-ID")}`
      : "—";

  return (
    <PageShell maxWidth="max-w-6xl" className="space-y-5 p-4 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
        <div className="space-y-5 lg:col-span-8">
      <Card padding="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative shrink-0 self-center sm:self-start">
            <UserAvatar
              name={profile.name || String(currentUser?.name ?? "User")}
              src={avatarPreview}
              size={80}
              className="border-2 border-erp-border"
            />
            <label
              htmlFor="avatar-upload-profile"
              className={`absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm ${uploadingAvatar ? "pointer-events-none opacity-70" : "cursor-pointer hover:bg-indigo-700"}`}
              title={t("hr.profile.self.changeAvatar")}
            >
              <Camera className="h-4 w-4" aria-hidden />
              <span className="sr-only">{t("hr.profile.self.changeAvatar")}</span>
            </label>
            <input
              ref={avatarInputRef}
              id="avatar-upload-profile"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadingAvatar}
              onChange={handleAvatarUpload}
            />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="text-xl font-bold text-erp-text">
              {profile.name || String(currentUser?.name ?? t("hr.profile.self.userLabel"))}
            </h1>
            <p className="text-sm text-erp-text-muted">{profile.email || String(currentUser?.email ?? "")}</p>
            <p className="mt-0.5 text-sm font-medium text-indigo-700">{roleLabelFromEmployment(employment, t)}</p>
            <p className="text-sm text-erp-text-muted">{primary.label}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {t("profile.changePhoto")}
              </Button>
              {profile.avatar ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleAvatarDelete()}
                  disabled={uploadingAvatar}
                  className="text-erp-danger hover:text-red-700"
                >
                  {t("profile.removePhoto")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card padding="p-0">
        <div className="px-4 pt-2 sm:px-5">
          <Tabs items={tabItems} value={tab} onChange={navigateTab} />
        </div>

        <div className="px-4 pb-5 sm:px-5">
          <TabPanel id="ringkasan" activeId={tab}>
            <section id="ringkasan">
              <SectionHeader
                title={t("hr.profile.self.employmentTitle")}
                description={t("hr.profile.self.employmentHint")}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryField label={t("hr.profile.self.userLabel")} value={displayOrDash(profile.name)} />
                <SummaryField label={t("hr.profile.self.adminEntity")} value={primary.label} />
                <SummaryField label={t("hr.profile.self.division")} value={displayOrDash(employment.division)} />
                <SummaryField label={t("hr.profile.self.department")} value={displayOrDash(employment.department)} />
                <SummaryField label={t("hr.profile.self.position")} value={displayOrDash(employment.position)} />
                <SummaryField label={t("hr.profile.self.role")} value={roleLabelFromEmployment(employment, t)} />
                <SummaryField
                  label={t("hr.profile.self.joinDate")}
                  value={formatJoinDate(employment.join_date, locale)}
                />
                <SummaryField label={t("hr.profile.self.salary")} value={salaryText} />
              </div>
            </section>
          </TabPanel>

          <TabPanel id="pribadi" activeId={tab}>
            <div id="pribadi" className="space-y-5">
              <Card>
                <CardHeader
                  title={t("hr.profile.self.personalTitle")}
                  description={t("hr.profile.self.personalHint")}
                />
                <form onSubmit={handlePersonalSubmit} className="space-y-6">
                  <FormSection title={t("profile.sections.personalData")}>
                    <FormField label={t("hr.profile.self.dateOfBirth")} htmlFor="profile-dob">
                      <Input
                        id="profile-dob"
                        type="date"
                        name="date_of_birth"
                        value={formData.date_of_birth}
                        onChange={(e) => setFormData((f) => ({ ...f, date_of_birth: e.target.value }))}
                      />
                    </FormField>
                    <FormSectionFullWidth>
                      <FormField label={t("hr.profile.self.bio")} htmlFor="profile-bio">
                        <Textarea
                          id="profile-bio"
                          name="bio"
                          value={formData.bio}
                          onChange={(e) => setFormData((f) => ({ ...f, bio: e.target.value }))}
                          rows={3}
                        />
                      </FormField>
                    </FormSectionFullWidth>
                  </FormSection>
                  <FormSection title={t("profile.sections.contact")}>
                    <FormField label={t("hr.profile.self.phone")} htmlFor="profile-phone">
                      <Input
                        id="profile-phone"
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                      />
                    </FormField>
                    <FormSectionFullWidth>
                      <FormField label={t("hr.profile.self.address")} htmlFor="profile-address">
                        <Textarea
                          id="profile-address"
                          name="address"
                          value={formData.address}
                          onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                          rows={2}
                        />
                      </FormField>
                    </FormSectionFullWidth>
                  </FormSection>
                  <ActionBar className="relative -mx-5 border-t border-erp-border px-5 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                    <Button type="submit" loading={saving} className="w-full sm:w-auto">
                      <Save className="h-4 w-4" aria-hidden />
                      {saving ? t("profile.saving") : t("hr.profile.self.saveProfile")}
                    </Button>
                  </ActionBar>
                </form>
              </Card>
              <PayrollBankAccountSection onToast={showToast} />
            </div>
          </TabPanel>

          <TabPanel id="dokumen" activeId={tab}>
            <EmployeePrivateDocumentsPanel />
          </TabPanel>

          <TabPanel id="keamanan" activeId={tab}>
            <section id="keamanan">
              <CardHeader
                title={t("hr.profile.self.accountTitle")}
                description={t("hr.profile.self.accountHint")}
              />
              <FormField label={t("profile.emailLogin")} htmlFor="profile-email" className="mt-4">
                <Input id="profile-email" type="email" disabled value={profile.email || ""} readOnly />
              </FormField>

              <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4 border-t border-erp-border pt-5">
                <SectionHeader
                  title={t("hr.profile.self.passwordTitle")}
                  description={t("hr.profile.self.passwordDesc")}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormSectionFullWidth>
                    <FormField label={t("hr.profile.self.passwordOld")} htmlFor="profile-password-old">
                      <Input
                        id="profile-password-old"
                        type="password"
                        autoComplete="current-password"
                        value={passwordOld}
                        onChange={(e) => setPasswordOld(e.target.value)}
                      />
                    </FormField>
                  </FormSectionFullWidth>
                  <FormField label={t("hr.profile.self.passwordNew")} htmlFor="profile-password-new">
                    <Input
                      id="profile-password-new"
                      type="password"
                      autoComplete="new-password"
                      value={passwordNew}
                      onChange={(e) => setPasswordNew(e.target.value)}
                    />
                  </FormField>
                  <FormField label={t("hr.profile.self.passwordConfirm")} htmlFor="profile-password-confirm">
                    <Input
                      id="profile-password-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                    />
                  </FormField>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" loading={passwordSaving} className="w-full sm:w-auto">
                    <KeyRound className="h-4 w-4" aria-hidden />
                    {passwordSaving ? t("profile.saving") : t("hr.profile.self.passwordSave")}
                  </Button>
                </div>
              </form>
              <div className="mt-6 lg:hidden">
                <AccountPreferencesPanel />
              </div>
            </section>
          </TabPanel>
        </div>
      </Card>
        </div>

        <aside className="hidden lg:block lg:col-span-4">
          <AccountPreferencesPanel />
        </aside>
      </div>
    </PageShell>
  );
}
