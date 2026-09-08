/** English display labels for HR dropdown values (PocketBase stores Indonesian text). */
export const HR_POSITION_LABELS_EN: Record<string, string> = {
  "Direktur Utama": "Chief Executive",
  "Wakil Direktur": "Deputy Director",
  Direktur: "Director",
  "General Manager (GM)": "General Manager (GM)",
  Manajer: "Manager",
  "Asisten Manajer": "Assistant Manager",
  Supervisor: "Supervisor",
  Koordinator: "Coordinator",
  "Team Leader": "Team Leader",
  "Staff Ahli / Senior": "Senior Specialist",
  Staff: "Staff",
  Officer: "Officer",
  Administrasi: "Administration",
  Akuntan: "Accountant",
  "HR / Personalia": "HR / Personnel",
  "Marketing & Branding": "Marketing & Branding",
  "Sales / Penjualan": "Sales",
  "Customer Service": "Customer Service",
  "Operator Produksi": "Production Operator",
  Teknisi: "Technician",
  "QC / QA": "QC / QA",
  Gudang: "Warehouse",
  "Kurir / Driver": "Courier / Driver",
  "Satpam / Security": "Security",
  "Office Boy / OB": "Office Assistant",
  Resepsionis: "Receptionist",
  "Magang / Intern": "Intern",
};

export const HR_DEPARTMENT_LABELS_EN: Record<string, string> = {
  Direksi: "Executive Board",
  "Sekretariat Perusahaan": "Corporate Secretariat",
  "Keuangan & Akuntansi": "Finance & Accounting",
  "SDM / HR": "HR",
  "Pemasaran & Penjualan": "Marketing & Sales",
  Operasional: "Operations",
  Produksi: "Production",
  "Gudang & Logistik": "Warehouse & Logistics",
  "Pengadaan / Procurement": "Procurement",
  "IT / Teknologi Informasi": "IT",
  "Hukum & Kepatuhan": "Legal & Compliance",
  "Riset & Pengembangan (R&D)": "R&D",
  "Layanan Pelanggan": "Customer Service",
  "Teknik & Pemeliharaan": "Engineering & Maintenance",
  "Administrasi Umum": "General Administration",
  "Internal Audit": "Internal Audit",
  "PPIC / Perencanaan Produksi": "Production Planning (PPIC)",
};

export const HR_DIVISION_LABELS_EN: Record<string, string> = {
  "Korporat / Holding": "Corporate / Holding",
  "Strategi & Bisnis": "Strategy & Business",
  "Komersial & Pemasaran": "Commercial & Marketing",
  "Operasional & Produksi": "Operations & Production",
  "Rantai Pasok & Logistik": "Supply Chain & Logistics",
  "Teknologi & Digital": "Technology & Digital",
  "Keuangan & Investasi": "Finance & Investment",
  "Sumber Daya Manusia": "Human Resources",
  "Pendukung / Shared Services": "Shared Services",
  "Cabang / Regional": "Branch / Regional",
  "Retail / Outlet": "Retail / Outlet",
};

export function localizeHrOptionLabel(
  value: string,
  locale: string,
  enMap: Record<string, string>
): string {
  if (locale === "en" && enMap[value]) return enMap[value];
  return value;
}
