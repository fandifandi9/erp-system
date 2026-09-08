import { normalizeAuthModel } from "@/lib/rbac";
import {
  hasOperationalBypass,
  readOperationalAccess,
} from "@/lib/operational-access-gate";
import { isOperationalWorkSectionLocked } from "@/lib/work-dashboard-menu";

export type AccessState = "open" | "locked" | "always";

export type WorkDashboardStatusRow = {
  id: string;
  label: string;
  state: AccessState;
  headline: string;
  detail: string;
};

export type WorkDashboardAccessSummary = {
  rows: WorkDashboardStatusRow[];
  overallLabel: string;
  overallTone: "success" | "warning" | "neutral";
  checkedIn: boolean;
  webAccess: boolean;
  bypass: boolean;
  workSectionLocked: boolean;
};

function readCheckedIn(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  const v = user.is_checked_in;
  if (typeof v === "boolean") return v;
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

function formatIsoHint(iso: unknown): string | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getWorkDashboardAccessSummary(
  user: Record<string, unknown> | null | undefined
): WorkDashboardAccessSummary {
  const bypass = hasOperationalBypass(user);
  const webAccess = readOperationalAccess(user);
  const checkedIn = readCheckedIn(user);
  const auth = normalizeAuthModel(user);
  const workSectionLocked = isOperationalWorkSectionLocked(user);

  const personalRow: WorkDashboardStatusRow = {
    id: "personal",
    label: "Menu personal",
    state: "always",
    headline: "Selalu terbuka",
    detail: "Cuti, lembur, luar kantor — tab Absensi. Slip gaji — tab Profil.",
  };

  let workRow: WorkDashboardStatusRow;
  if (bypass) {
    workRow = {
      id: "work",
      label: "Meja kerja",
      state: "always",
      headline: "Selalu terbuka",
      detail:
        auth.accountType === "owner" || auth.roleCode === "hr"
          ? "Antrean HR tidak dibatasi check-in."
          : "Modul meja kerja tidak dibatasi untuk peran ini.",
    };
  } else if (!workSectionLocked) {
    const lastIn = formatIsoHint(user?.last_checkin);
    workRow = {
      id: "work",
      label: "Meja kerja",
      state: "open",
      headline: "Terbuka",
      detail: lastIn
        ? `Aktif setelah check-in (${lastIn}). Tertutup lagi setelah check-out.`
        : "Sesi operasional aktif — meja kerja terbuka.",
    };
  } else {
    workRow = {
      id: "work",
      label: "Meja kerja",
      state: "locked",
      headline: "Terkunci",
      detail: checkedIn
        ? "Check-in ada tetapi sesi belum aktif — tarik layar untuk refresh, atau check-in ulang."
        : "Check-in dulu di tab Absensi untuk membuka meja kerja.",
    };
  }

  const attendanceRow: WorkDashboardStatusRow = {
    id: "attendance",
    label: "Absensi hari ini",
    state: checkedIn ? "open" : "locked",
    headline: checkedIn ? "Sudah check-in" : "Belum check-in",
    detail: "Check-in/out hanya dari tab Absensi — tidak mengunci menu personal.",
  };

  let overallLabel: string;
  let overallTone: WorkDashboardAccessSummary["overallTone"];
  if (bypass) {
    overallLabel = "Personal & kerja selalu aktif";
    overallTone = "success";
  } else if (!workSectionLocked) {
    overallLabel = "Meja kerja terbuka";
    overallTone = "success";
  } else {
    overallLabel = "Meja kerja terkunci";
    overallTone = "warning";
  }

  return {
    rows: [personalRow, workRow, attendanceRow],
    overallLabel,
    overallTone,
    checkedIn,
    webAccess,
    bypass,
    workSectionLocked,
  };
}

export const WORK_DASHBOARD_GUIDE = [
  {
    title: "Menu personal",
    body: "Cuti, lembur, luar kantor — tab Absensi. Slip gaji — tab Profil.",
  },
  {
    title: "Meja kerja (staf)",
    body: "Tertutup sampai check-in di tab Absensi; terbuka lagi setelah check-out. Owner/HR selalu bisa buka antrean.",
  },
  {
    title: "Check-in / check-out",
    body: "Hanya meja kerja yang mengikuti sesi absensi (kecuali Owner & HR). Absensi & profil tidak ikut tertutup.",
  },
  {
    title: "Owner & HR",
    body: "Antrean respons cuti/lembur/luar kantor selalu aktif di tab Meja kerja.",
  },
] as const;
