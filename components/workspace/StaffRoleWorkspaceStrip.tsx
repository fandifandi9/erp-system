"use client";

/**
 * Phase NEXT — capability-aware module strip on Staff Desktop home.
 * Personal overview remains separate; this is ERP workspace entry, not Meja Kerja.
 */

import Link from "next/link";
import {
  Building2,
  ClipboardList,
  FileWarning,
  Moon,
  Star,
  UserPlus,
  Users,
  Calendar,
  Clock,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess } from "@/lib/rbac";
import { canAccessHrWebModule } from "@/lib/capabilities/web-access";

type HubLink = {
  href: string;
  label: string;
  desc: string;
  icon: typeof Users;
  accessPath: string;
};

const HR_HUB_LINKS: HubLink[] = [
  {
    href: "/hr",
    label: "Dashboard HR",
    desc: "Ringkasan operasional SDM",
    icon: Building2,
    accessPath: "/hr",
  },
  {
    href: "/hr/employees",
    label: "Karyawan",
    desc: "Direktori & data pegawai",
    icon: Users,
    accessPath: "/hr/employees",
  },
  {
    href: "/pengaturan/organisasi",
    label: "Organisasi",
    desc: "Struktur & jabatan",
    icon: Building2,
    accessPath: "/pengaturan/organisasi",
  },
  {
    href: "/hr/recruitment-approvals",
    label: "Recruitment",
    desc: "Persetujuan penempatan",
    icon: UserPlus,
    accessPath: "/hr/employees",
  },
  {
    href: "/hr/attendance",
    label: "Attendance HR",
    desc: "Monitoring kehadiran tim",
    icon: Clock,
    accessPath: "/hr/attendance",
  },
  {
    href: "/hr/leave",
    label: "Cuti (antrean)",
    desc: "Review pengajuan cuti",
    icon: Calendar,
    accessPath: "/hr/leave",
  },
  {
    href: "/hr/overtime",
    label: "Lembur (antrean)",
    desc: "Review pengajuan lembur",
    icon: Moon,
    accessPath: "/hr/overtime",
  },
  {
    href: "/hr/findings",
    label: "Temuan",
    desc: "Findings & tindak lanjut",
    icon: FileWarning,
    accessPath: "/hr/findings",
  },
  {
    href: "/hr/rating",
    label: "Rating",
    desc: "Penilaian kinerja",
    icon: Star,
    accessPath: "/hr/rating",
  },
  {
    href: "/hr/reports",
    label: "Laporan",
    desc: "Laporan staff / SDM",
    icon: ClipboardList,
    accessPath: "/hr/reports",
  },
];

export function StaffRoleWorkspaceStrip() {
  const user = pb.authStore.model as Record<string, unknown> | null;
  if (!user || !canAccessHrWebModule(user)) return null;

  const links = HR_HUB_LINKS.filter((l) => canAccess(user, l.accessPath));
  if (links.length === 0) return null;

  return (
    <section className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 to-white px-4 py-4 shadow-sm sm:px-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            Workspace ERP
          </p>
          <h2 className="text-base font-semibold text-slate-900">Modul HR sesuai kewenangan Anda</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Bukan Meja Kerja — ini menu workspace penuh. Tugas mendesak ada di sidebar Meja Kerja.
          </p>
        </div>
        <Link
          href="/hr"
          className="text-xs font-medium text-indigo-700 hover:underline"
        >
          Buka Dashboard HR →
        </Link>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href + item.label}>
              <Link
                href={item.href}
                className="flex min-h-[3.25rem] items-start gap-3 rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2.5 transition hover:border-indigo-300 hover:bg-indigo-50/50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                  <span className="block text-[11px] leading-snug text-slate-500">{item.desc}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
