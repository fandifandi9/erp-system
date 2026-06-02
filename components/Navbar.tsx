"use client";

import { pb } from "@/lib/pocketbase";
import Image from "next/image";
import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getDefaultRouteForUser, canAccess } from "@/lib/rbac";

import { Menu, X } from "lucide-react";
import { AppBrand } from "@/components/AppBrand";

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
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ambil user (client-only)
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const profileData = await pb.collection("profiles").getFirstListItem(
        `user="${userId}"`,
        { requestKey: null }
      );
      setProfile(profileData as unknown as NavProfile);
    } catch (err) {
      console.error("Failed to load profile:", err);
    }
  }, []);

  useEffect(() => {
    const currentUser = pb.authStore.model as User;
    setUser(currentUser);

    if (currentUser?.id) {
      loadProfile(currentUser.id);
    }
  }, [loadProfile]);

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

  const handleLogout = () => {
    setIsLoggingOut(true);
    setOpen(false);
    pb.authStore.clear();
    // Navigasi penuh: di dev-mode Next lebih responsif daripada client router
    // (kurangi layar "Sedang logout..." menunggu kompilasi / transisi SPA).
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    } else {
      router.replace("/login");
    }
  };

  if (!user) return null;

  const displayName = user.name || user.email || "User";
  const initial = displayName.charAt(0).toUpperCase();
  
  const getAvatarUrl = () => {
    if (!profile || !profile.avatar) return null;
    return pb.files.getURL(profile, profile.avatar, { thumb: "100x100" });
  };

  const getProfileRoute = () => {
    if (user && canAccess(user as Record<string, unknown>, "/profile")) return "/profile";
    return getDefaultRouteForUser(user as Record<string, unknown>);
  };

  const authUser = user as Record<string, unknown>;
  const showProfilNav = canAccess(authUser, "/profile");

  return (
    <>
      {isLoggingOut && (
        <div className="fixed inset-0 z-[9999] bg-white/85 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-700">
            <div className="h-10 w-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm font-medium">Sedang logout...</p>
          </div>
        </div>
      )}

      <header className="flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 pt-[env(safe-area-inset-top,0px)] sm:h-16 sm:px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className={
              (showHamburger ? "inline-flex" : "hidden") +
              " shrink-0 items-center justify-center rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            }
            aria-label={mobileNavOpen ? "Tutup menu" : "Buka menu"}
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
          <AppBrand
            height={28}
            nameClassName="text-sm text-slate-800 sm:text-base"
          />
        </div>

        {/* RIGHT */}
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
              <p className="text-xs text-slate-500 capitalize">
                {user.role}
              </p>
            </div>

            {/* AVATAR */}
            {getAvatarUrl() ? (
              <Image
                src={getAvatarUrl()!}
                alt="Avatar"
                width={36}
                height={36}
                className="w-9 h-9 rounded-full object-cover border-2 border-slate-200"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center text-sm font-semibold">
                {initial}
              </div>
            )}
          </button>

          {/* DROPDOWN */}
          {open && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95">
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
                  Profil
                </button>
              )}

              {showProfilNav ? <div className="border-t border-slate-100" /> : null}

              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
    </>
  );
}