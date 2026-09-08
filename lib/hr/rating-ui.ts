import { createTranslator } from "@/lib/i18n";

type TFn = ReturnType<typeof createTranslator>;

const ASPECT_NAME_TO_CODE: Record<string, string> = {
  discipline: "discipline",
  responsibility: "responsibility",
  teamwork: "teamwork",
  communication: "communication",
  "work quality": "work_quality",
  work_quality: "work_quality",
  disiplin: "discipline",
  "tanggung jawab": "responsibility",
  "kerja sama": "teamwork",
  komunikasi: "communication",
  "kualitas kerja": "work_quality",
};

const API_ERROR_EXACT: Record<string, string> = {
  "Login diperlukan.": "hr.rating.errors.loginRequired",
  "Akses ditolak.": "hr.rating.errors.noAccess",
  "Akses HR ditolak.": "hr.rating.errors.noAccess",
  "Nama dan tanggal wajib.": "hr.rating.errors.required",
  "Lengkapi semua aspek sebelum submit.": "hr.rating.errors.incompleteAspects",
  "Sudah dikirim dan terkunci.": "hr.rating.errors.locked",
  "HR tidak dapat membuat assignment rating untuk diri sendiri. Minta Owner.": "hr.rating.errors.hrSelf",
};

function lookup(t: TFn, path: string, fallback: string): string {
  const value = t(path);
  return value === path ? fallback : value;
}

export function translateRatingLabel(t: TFn, group: "status" | "category" | "tier", raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "—";
  return lookup(t, `hr.rating.${group}.${value}`, value);
}

export function translateRatingMethod(t: TFn, method: string | null | undefined): string {
  const m = String(method || "").toLowerCase();
  if (m === "smart_random") return t("hr.rating.assignments.smartRandom");
  if (m === "manual") return t("hr.rating.assignments.manual");
  return method || "—";
}

export function translateAspectName(t: TFn, code?: string | null, name?: string | null): string {
  const fromCode = String(code || "").trim().toLowerCase();
  if (fromCode) {
    const mapped = lookup(t, `hr.rating.aspects.${fromCode}`, "");
    if (mapped) return mapped;
  }
  const fromName = ASPECT_NAME_TO_CODE[String(name || "").trim().toLowerCase()];
  if (fromName) {
    const mapped = lookup(t, `hr.rating.aspects.${fromName}`, "");
    if (mapped) return mapped;
  }
  return String(name || code || "—");
}

export function progressHelperText(t: TFn, completed: number, selected: number): string {
  if (selected <= 0 || completed <= 0) return t("hr.rating.progress.noneDone");
  if (completed >= selected) return t("hr.rating.progress.allDone");
  return t("hr.rating.progress.partial", { done: completed, total: selected });
}

export function translateRatingApiError(raw: string | null | undefined, t: TFn, fallbackKey: string): string {
  const msg = String(raw || "").trim();
  if (!msg) return t(fallbackKey);

  const insufficient = msg.match(/Reviewer tersedia hanya (\d+) orang dari (\d+)/i);
  if (insufficient) {
    return t("hr.rating.errors.insufficient", { x: insufficient[1], y: insufficient[2] });
  }

  const mapped = API_ERROR_EXACT[msg];
  if (mapped) return t(mapped);

  if (/requested resource wasn't found/i.test(msg) || /Koleksi Rating tidak ada/i.test(msg)) {
    return t("hr.rating.errors.unavailable");
  }
  if (/tidak ditemukan/i.test(msg)) return t("hr.rating.errors.notFound");
  if (/akses ditolak|tidak memiliki akses/i.test(msg)) return t("hr.rating.errors.noAccess");
  if (/ECONN|Internal Server|Failed to fetch|ClientResponseError|TypeError/i.test(msg)) {
    return t("hr.rating.errors.generic");
  }
  return msg;
}
