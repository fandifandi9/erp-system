/**
 * Opsi dropdown HR — nilai disimpan sebagai string di PocketBase (profiles, dll).
 * Satu sumber kebenaran agar kuota divisi & formulir karyawan selaras.
 */
export type EmployeeSelectOption = { value: string; label: string };

export const DIVISION_OPTIONS: EmployeeSelectOption[] = [
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
