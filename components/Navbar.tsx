"use client";

import { pb } from "@/lib/pocketbase";
import Image from "next/image";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getDefaultRouteForUser } from "@/lib/rbac";

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

export default function Navbar() {
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
    const role = user.role?.toLowerCase();
    if (role === "staff") return "/dashboard-staff/profile";
    if (role === "hr" || role === "owner") return "/hr/profile";
    return getDefaultRouteForUser(user); // safe fallback
  };

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

      <header className="w-full flex items-center justify-between px-6 h-16 bg-white border-b border-slate-200">
        {/* LEFT */}
        <div className="flex items-center gap-3">
          <div className="text-base font-semibold text-slate-800 tracking-tight">
            SERBA ERP
          </div>
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
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push(getProfileRoute());
                }}
                className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 transition flex items-center gap-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profil Saya
              </button>

              <div className="border-t border-slate-100" />

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