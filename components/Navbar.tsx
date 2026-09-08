"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getDefaultRouteForUser, canAccess, getOperationalDashboardRoute } from "@/lib/rbac";
import { resolveNavbarOrgSubtitle } from "@/lib/org/navbar-org-subtitle";

import { Menu, X } from "lucide-react";
import { AppBrand } from "@/components/AppBrand";
import { EntityBrandMark } from "@/components/ui/entity-brand-mark";
import { ActivityNotificationBell } from "@/components/ActivityNotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/components/LocaleProvider";
import { clearClientAuthSession } from "@/lib/pb-auth-cookie";
import { fetchSelfProfileApi, resolveSelfAvatarPreviewUrl } from "@/lib/profile-self-api";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { UserAvatar } from "@/components/UserAvatar";

/** Samakan dengan Sidebar: drawer + hamburger sampai &lt; lg (1024px), hindari sidebar “desktop” di HP landscape / tablet. */
function subscribeMaxLg(cb: () => void) {
  const mq = window.matchMedia("(max-width: 1023px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getMaxLg(): boolean {
  return window.matchMedia("(max-width: 1023px)").matches;
}

type User = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
};

type NavProfile = {
  id: string;
  avatar?: string;
  avatar_url?: string | null;
};

type NavbarProps = {
  onOpenMobileNav?: () => void;
  onCloseMobileNav?: () => void;
  mobileNavOpen?: boolean;
};

export default function Navbar({
  onOpenMobileNav,
  onCloseMobileNav,
  mobileNavOpen = false,
}: NavbarProps) {
  const narrow = useSyncExternalStore(subscribeMaxLg, getMaxLg, () => false);
  const showHamburger = narrow;
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<NavProfile | null>(null);
  const [entityBrand, setEntityBrand] = useState<{ display_name: string; logo_url?: string | null } | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useLocale();

  // Ambil user (client-only)
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const data = await fetchSelfProfileApi();
      setProfile({
        id: data.id,
        avatar: data.avatar ?? undefined,
        avatar_url: resolveSelfAvatarPreviewUrl(data),
      });
    } catch (err) {
      console.error("Failed to load profile:", err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const currentUser = pb.authStore.model as User;
    setUser(currentUser);

    if (currentUser?.id) {
      loadProfile(currentUser.id);
    }
  }, [loadProfile]);

  useEffect(() => {
    const authUser = pb.authStore.model as Record<string, unknown> | null;
    if (!authUser || getOperationalDashboardRoute(authUser) !== "/dashboard-staff") {
      setEntityBrand(null);
      return;
    }

    let cancelled = false;
    void fetch("/api/profile/self/entity-identity", {
      credentials: "include",
      headers: hrApiAuthHeaders(),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; data?: { display_name: string; logo_url?: string | null } }) => {
        if (!cancelled && j.ok && j.data) setEntityBrand(j.data);
      })
      .catch(() => {
        if (!cancelled) setEntityBrand(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Close dropdown saat klik di luar
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dengan ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setOpen(false);
    await clearClientAuthSession(pb);
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    } else {
      router.replace("/login");
    }
  };

  if (!user) return null;

  const displayName = user.name || user.email || "User";
  const orgSubtitle = resolveNavbarOrgSubtitle(user as Record<string, unknown>);

  const getAvatarUrl = () => profile?.avatar_url ?? null;

  const getProfileRoute = () => {
    if (user && canAccess(user as Record<string, unknown>, "/profile")) return "/profile";
    return getDefaultRouteForUser(user as Record<string, unknown>);
  };

  const authUser = user as Record<string, unknown>;
  const showProfilNav = canAccess(authUser, "/profile");
  const isStaffShell = getOperationalDashboardRoute(authUser) === "/dashboard-staff";

  return (
    <>
      {isLoggingOut && (
        <div className="fixed inset-0 z-[9999] bg-white/85 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-700">
            <div className="h-10 w-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm font-medium">{t("nav.loggingOut")}</p>
          </div>
        </div>
      )}

      <header className="flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-erp-border bg-erp-surface px-3 pt-[env(safe-area-inset-top,0px)] sm:h-16 sm:px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className={
              (showHamburger ? "inline-flex" : "hidden") +
              " shrink-0 items-center justify-center rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            }
            aria-label={mobileNavOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-controls="app-sidebar"
            aria-expanded={mobileNavOpen}
            onClick={() =>
              mobileNavOpen ? onCloseMobileNav?.() : onOpenMobileNav?.()
            }
          >
            {mobileNavOpen ? (
              <X className="h-6 w-6" strokeWidth={2} />
            ) : (
              <Menu className="h-6 w-6" strokeWidth={2} />
            )}
          </button>
          {!isStaffShell ? (
            <AppBrand height={28} showName={false} />
          ) : entityBrand?.display_name ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <EntityBrandMark
                name={entityBrand.display_name}
                logoUrl={entityBrand.logo_url}
                size="sm"
              />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {entityBrand.display_name}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* RIGHT: notifikasi + profil */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ActivityNotificationBell />
          <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 transition focus:outline-none"
          >
            {/* TEXT */}
            <div className="text-right hidden sm:block leading-tight">
              <p className="text-sm font-medium text-slate-800">
                {displayName}
              </p>
              {orgSubtitle ? (
                <p className="text-xs text-slate-500">{orgSubtitle}</p>
              ) : null}
            </div>

            {/* AVATAR */}
            <UserAvatar name={displayName} src={getAvatarUrl()} size={36} />
          </button>

          {/* DROPDOWN */}
          {open && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95">
              {showProfilNav && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(getProfileRoute());
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 transition flex items-center gap-3"
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {t("dashboard.profile")}
                </button>
              )}

              {showProfilNav ? <div className="border-t border-slate-100" /> : null}

              <LanguageSwitcher dropdown />

              <div className="border-t border-slate-100" />

              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition"
              >
                {t("nav.logout")}
              </button>
            </div>
          )}
          </div>
        </div>
      </header>
    </>
  );
}