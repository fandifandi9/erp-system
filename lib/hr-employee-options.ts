/**
 * Opsi dropdown HR — disimpan di PocketBase (`hr_employee_options`).
 * Fallback ke daftar default jika koleksi belum ada.
 */
import { pb } from "@/lib/pocketbase";

export type EmployeeSelectOption = { value: string; label: string };

export type HrOptionCategory = "position" | "department" | "division";

export const HR_EMPLOYEE_OPTIONS_COLLECTION = "hr_employee_options";

export type HrEmployeeOptionRecord = {
  id: string;
  category: HrOptionCategory;
  name: string;
  sort_order?: number;
  is_active?: boolean;
};

function escFilter(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export const DEFAULT_POSITION_OPTIONS: EmployeeSelectOption[] = [
  { value: "Direktur Utama", label: "Direktur Utama" },
  { value: "Wakil Direktur", label: "Wakil Direktur" },
  { value: "Direktur", label: "Direktur" },
  { value: "General Manager (GM)", label: "General Manager (GM)" },
  { value: "Manajer", label: "Manajer" },
  { value: "Asisten Manajer", label: "Asisten Manajer" },
  { value: "Supervisor", label: "Supervisor" },
  { value: "Koordinator", label: "Koordinator" },
  { value: "Team Leader", label: "Team Leader" },
  { value: "Staff Ahli / Senior", label: "Staff Ahli / Senior" },
  { value: "Staff", label: "Staff" },
  { value: "Officer", label: "Officer" },
  { value: "Administrasi", label: "Administrasi" },
  { value: "Akuntan", label: "Akuntan" },
  { value: "HR / Personalia", label: "HR / Personalia" },
  { value: "Marketing & Branding", label: "Marketing & Branding" },
  { value: "Sales / Penjualan", label: "Sales / Penjualan" },
  { value: "Customer Service", label: "Customer Service" },
  { value: "Operator Produksi", label: "Operator Produksi" },
  { value: "Teknisi", label: "Teknisi" },
  { value: "QC / QA", label: "QC / QA" },
  { value: "Gudang", label: "Gudang" },
  { value: "Kurir / Driver", label: "Kurir / Driver" },
  { value: "Satpam / Security", label: "Satpam / Security" },
  { value: "Office Boy / OB", label: "Office Boy / OB" },
  { value: "Resepsionis", label: "Resepsionis" },
  { value: "Magang / Intern", label: "Magang / Intern" },
];

export const DEFAULT_DEPARTMENT_OPTIONS: EmployeeSelectOption[] = [
  { value: "Direksi", label: "Direksi" },
  { value: "Sekretariat Perusahaan", label: "Sekretariat Perusahaan" },
  { value: "Keuangan & Akuntansi", label: "Keuangan & Akuntansi" },
  { value: "SDM / HR", label: "SDM / HR" },
  { value: "Pemasaran & Penjualan", label: "Pemasaran & Penjualan" },
  { value: "Operasional", label: "Operasional" },
  { value: "Produksi", label: "Produksi" },
  { value: "Gudang & Logistik", label: "Gudang & Logistik" },
  { value: "Pengadaan / Procurement", label: "Pengadaan / Procurement" },
  { value: "IT / Teknologi Informasi", label: "IT / Teknologi Informasi" },
  { value: "Hukum & Kepatuhan", label: "Hukum & Kepatuhan" },
  { value: "Riset & Pengembangan (R&D)", label: "Riset & Pengembangan (R&D)" },
  { value: "Layanan Pelanggan", label: "Layanan Pelanggan" },
  { value: "Teknik & Pemeliharaan", label: "Teknik & Pemeliharaan" },
  { value: "Administrasi Umum", label: "Administrasi Umum" },
  { value: "Internal Audit", label: "Internal Audit" },
  { value: "PPIC / Perencanaan Produksi", label: "PPIC / Perencanaan Produksi" },
];

export const DEFAULT_DIVISION_OPTIONS: EmployeeSelectOption[] = [
  { value: "Korporat / Holding", label: "Korporat / Holding" },
  { value: "Strategi & Bisnis", label: "Strategi & Bisnis" },
  { value: "Komersial & Pemasaran", label: "Komersial & Pemasaran" },
  { value: "Operasional & Produksi", label: "Operasional & Produksi" },
  { value: "Rantai Pasok & Logistik", label: "Rantai Pasok & Logistik" },
  { value: "Teknologi & Digital", label: "Teknologi & Digital" },
  { value: "Keuangan & Investasi", label: "Keuangan & Investasi" },
  { value: "Sumber Daya Manusia", label: "Sumber Daya Manusia" },
  { value: "Pendukung / Shared Services", label: "Pendukung / Shared Services" },
  { value: "Cabang / Regional", label: "Cabang / Regional" },
  { value: "Retail / Outlet", label: "Retail / Outlet" },
];

/** @deprecated Import DEFAULT_DIVISION_OPTIONS — alias untuk kompatibilitas */
export const DIVISION_OPTIONS: EmployeeSelectOption[] = DEFAULT_DIVISION_OPTIONS;

export function defaultOptionsForCategory(category: HrOptionCategory): EmployeeSelectOption[] {
  if (category === "position") return DEFAULT_POSITION_OPTIONS;
  if (category === "department") return DEFAULT_DEPARTMENT_OPTIONS;
  return DEFAULT_DIVISION_OPTIONS;
}

function rowsToOptions(rows: HrEmployeeOptionRecord[]): EmployeeSelectOption[] {
  const seen = new Set<string>();
  const out: EmployeeSelectOption[] = [];
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: name, label: name });
  }
  return out;
}

const seedingByCategory = new Map<HrOptionCategory, Promise<void>>();

async function seedDefaultsIfEmpty(category: HrOptionCategory): Promise<void> {
  const pending = seedingByCategory.get(category);
  if (pending) {
    await pending;
    return;
  }

  const task = (async () => {
    const defaults = defaultOptionsForCategory(category);
    const existing = await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).getFullList<HrEmployeeOptionRecord>({
      filter: `category = "${category}"`,
      requestKey: null,
    });
    const known = new Set(existing.map((r) => r.name.trim().toLowerCase()));

    for (let i = 0; i < defaults.length; i++) {
      const name = defaults[i].value;
      if (known.has(name.toLowerCase())) continue;
      try {
        await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).create({
          category,
          name,
          sort_order: i,
          is_active: true,
        });
        known.add(name.toLowerCase());
      } catch {
        /* race / permission — skip item */
      }
    }
  })();

  seedingByCategory.set(category, task);
  try {
    await task;
  } finally {
    seedingByCategory.delete(category);
  }
}

export async function fetchHrEmployeeOptions(category: HrOptionCategory): Promise<EmployeeSelectOption[]> {
  try {
    const rows = await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).getFullList<HrEmployeeOptionRecord>({
      filter: `category = "${category}" && is_active = true`,
      sort: "sort_order,name",
      requestKey: null,
    });
    if (rows.length === 0) {
      await seedDefaultsIfEmpty(category);
      const seeded = await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).getFullList<HrEmployeeOptionRecord>({
        filter: `category = "${category}" && is_active = true`,
        sort: "sort_order,name",
        requestKey: null,
      });
      if (seeded.length > 0) return rowsToOptions(seeded);
      return defaultOptionsForCategory(category);
    }
    return rowsToOptions(rows);
  } catch (err) {
    console.warn(`[hr_employee_options] fetch ${category} failed — pakai default`, err);
    return defaultOptionsForCategory(category);
  }
}

export async function fetchAllHrEmployeeOptions(): Promise<Record<HrOptionCategory, EmployeeSelectOption[]>> {
  const [position, department, division] = await Promise.all([
    fetchHrEmployeeOptions("position"),
    fetchHrEmployeeOptions("department"),
    fetchHrEmployeeOptions("division"),
  ]);
  return { position, department, division };
}

export async function createHrEmployeeOption(
  category: HrOptionCategory,
  rawName: string,
): Promise<EmployeeSelectOption> {
  const name = rawName.trim();
  if (!name) throw new Error("Nama wajib diisi");

  const existing = await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).getFullList<HrEmployeeOptionRecord>({
    filter: `category = "${category}" && name = "${escFilter(name)}"`,
    requestKey: null,
  });

  if (existing.length > 0) {
    const row = existing[0];
    if (row.is_active === false) {
      await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).update(row.id, { is_active: true });
    }
    return { value: row.name, label: row.name };
  }

  const sortRows = await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).getFullList<{ sort_order?: number }>({
    filter: `category = "${category}"`,
    sort: "-sort_order",
    requestKey: null,
  });
  const nextSort = (sortRows[0]?.sort_order ?? -1) + 1;

  const created = await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).create<HrEmployeeOptionRecord>({
    category,
    name,
    sort_order: nextSort,
    is_active: true,
  });
  return { value: created.name, label: created.name };
}

export async function deactivateHrEmployeeOption(category: HrOptionCategory, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const rows = await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).getFullList<HrEmployeeOptionRecord>({
    filter: `category = "${category}" && name = "${escFilter(trimmed)}"`,
    requestKey: null,
  });
  if (rows.length === 0) return;
  await pb.collection(HR_EMPLOYEE_OPTIONS_COLLECTION).update(rows[0].id, { is_active: false });
}

export function optionValuesSet(options: EmployeeSelectOption[]): Set<string> {
  return new Set(options.map((o) => o.value));
}
