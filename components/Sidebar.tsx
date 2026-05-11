"use client";

import { pb } from "@/lib/pocketbase";
import Link from "next/link";
import { useEffect, useState } from "react";
import { canAccess, getDefaultRouteForUser, normalizeAuthModel } from "@/lib/rbac";

export default function Sidebar() {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    setUser(pb.authStore.model || null);
  }, []);

  if (!user) return null;

  const auth = normalizeAuthModel(user);
  const role = auth.roleCode;
  const isOwner = auth.accountType === "owner";
  const canSeeDashboard = auth.accountType === "owner" || auth.dashboardAccess;
  const canManageHr = canAccess(user, "/hr");

  const menuClass =
    "block px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition";

  const sectionTitle =
    "text-xs text-slate-400 mb-2 mt-4 uppercase tracking-wide";

  return (
    <div className="w-64 h-screen bg-slate-900 text-white flex flex-col">

      {/* LOGO */}
      <div className="p-4 border-b border-slate-800 mb-2">
        <h2 className="text-lg font-semibold tracking-tight">
          SERBA ERP
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p4 space-y-4">

      {/* ================= DASHBOARD ================= */}
      <div>
        <p className={sectionTitle}>Dashboard</p>

        {canSeeDashboard && (
          <Link href={getDefaultRouteForUser(user)} className={menuClass}>
            {isOwner ? "Owner Dashboard" : role === "hr" ? "HR Dashboard" : "Staff Dashboard"}
          </Link>
        )}
      </div>

      {/* ================= HR (ADMIN) ================= */}
{canManageHr && (
  <div>
    <p className={sectionTitle}>{isOwner ? "Owner Management" : "HR Management"}</p>

    <Link href="/hr/employees" className={menuClass}>
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        Data Karyawan
      </span>
    </Link>

    <Link href="/hr/attendance" className={menuClass}>
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        Monitoring Absensi
      </span>
    </Link>

    <Link href="/hr/attendance/suspicious" className={menuClass}>
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Aktivitas Mencurigakan
      </span>
    </Link>

    <Link href="/hr/leave" className={menuClass}>
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Permohonan Cuti
      </span>
    </Link>

    <Link href="/hr/overtime" className={menuClass}>
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        Lembur
      </span>
    </Link>

    <Link href="/hr/field-activity" className={menuClass}>
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Aktivitas luar kantor
      </span>
    </Link>

    <Link href="/hr/offices" className={menuClass}>
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Pengaturan GPS
      </span>
    </Link>

    <Link href="/hr/payroll" className={menuClass}>
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Payroll
      </span>
    </Link>

  </div>
)}

      {/* Menu karyawan: absensi & cuti */}
      {auth.accountType !== "owner" && canAccess(user, "/dashboard-staff/attendance") && (
        <div>
          <p className={sectionTitle}>Staff</p>

          <Link href="/dashboard-staff/attendance" className={menuClass}>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Absensi
            </span>
          </Link>

          <Link href="/dashboard-staff/leave" className={menuClass}>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Cuti
            </span>
          </Link>

          <Link href="/dashboard-staff/overtime" className={menuClass}>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Lembur
            </span>
          </Link>

          <Link href="/dashboard-staff/payroll" className={menuClass}>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Slip gaji
            </span>
          </Link>

          <Link href="/dashboard-staff/field-activity" className={menuClass}>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Aktivitas luar
            </span>
          </Link>
        </div>
      )}

      </div>

      {/* ================= FOOTER ================= */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
        ERP v1.0
      </div>
    </div>
  );
}