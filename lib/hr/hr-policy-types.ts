export const HR_POLICY_CATEGORIES = [
  "kehadiran",
  "keterlambatan",
  "ketidakhadiran",
  "cuti",
  "lembur",
  "hari_libur",
  "penggajian",
  "potongan_gaji",
] as const;

export type HrPolicyCategory = (typeof HR_POLICY_CATEGORIES)[number];

export type HrPolicyDto = {
  id: string;
  title: string;
  category: HrPolicyCategory;
  content: string;
  status: string;
  effective_from: string;
  updated: string;
  company_id?: string;
  company_name?: string;
  example_note?: string;
};

const CATEGORY_LABELS: Record<HrPolicyCategory, string> = {
  kehadiran: "Kehadiran",
  keterlambatan: "Keterlambatan",
  ketidakhadiran: "Ketidakhadiran",
  cuti: "Cuti",
  lembur: "Lembur",
  hari_libur: "Hari Libur",
  penggajian: "Penggajian",
  potongan_gaji: "Potongan Gaji",
};

export function hrPolicyCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat as HrPolicyCategory] ?? cat;
}

export type HolidayDto = {
  id: string;
  date: string;
  name: string;
  holiday_type: string;
  description?: string;
  company_id?: string;
  company_name?: string;
  is_active: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  national: "Libur Nasional",
  company: "Libur Perusahaan",
  collective_leave: "Cuti Bersama",
  other: "Lainnya",
};

export function holidayTypeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t;
}
