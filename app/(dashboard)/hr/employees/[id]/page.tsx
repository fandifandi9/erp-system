"use client";

import { pb } from "@/lib/pocketbase";
import { DIVISION_OPTIONS } from "@/lib/hr-employee-options";
import {
  getMaxBookingsPerMonth,
  PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD,
  parseLeaveBookingsQuotaFromProfile,
} from "@/lib/leave";
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

type EmployeeUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
};

type EmployeeProfile = {
  id: string;
  name?: string;
  position?: string;
  department?: string;
  /** Kuota pengajuan cuti (pending + disetujui) per bulan kalender — opsional di PocketBase */
  leave_bookings_quota?: number;
  salary?: number;
  office_id?: string;
  phone?: string;
  address?: string;
  division?: string;
  nik?: string;
  npwp?: string;
  employee_code?: string;
  profile_status?: string;
  late_tolerance?: number;
  shift_start?: string;
  shift_end?: string;
  join_date?: string;
  expand?: {
    user?: EmployeeUser;
  };
};

type OfficeItem = {
  id: string;
  name?: string;
};

type SelectOption = { value: string; label: string };

/** Pilihan umum perusahaan di Indonesia — nilai disimpan sebagai teks di profile */
const POSITION_OPTIONS: SelectOption[] = [
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

const DEPARTMENT_OPTIONS: SelectOption[] = [
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

function optionValuesSet(options: SelectOption[]): Set<string> {
  return new Set(options.map((o) => o.value));
}

/** Nilai PB bisa datetime lengkap — <input type="date"> butuh yyyy-MM-dd saja */
function joinDateFromPocketBase(raw: string | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : "";
}

/**
 * Kolom join_date di PocketBase sering bertipe Datetime — kirim ISO penuh
 * supaya tidak diabaikan / tidak gagal parse (hanya "yyyy-MM-dd" dari input HTML).
 */
function joinDateToPocketBase(raw: string): string | null {
  const d = raw.trim();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return `${d}T12:00:00.000Z`;
  }
  return d;
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [user, setUser] = useState<EmployeeUser | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [offices, setOffices] = useState<OfficeItem[]>([]);

  // FORM STATE
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  /** Hanya digit angka mentah; ditampilkan dengan pemisah ribuan id-ID */
  const [salaryDigits, setSalaryDigits] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [division, setDivision] = useState("");
  const [nik, setNik] = useState("");
  const [npwp, setNpwp] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [lateToleranceInput, setLateToleranceInput] = useState("10");
  const [joinDate, setJoinDate] = useState("");
  const [leaveBookingsQuota, setLeaveBookingsQuota] = useState(
    () => String(getMaxBookingsPerMonth())
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");

  // =========================
  // FETCH DATA
  // =========================
  const fetchOffices = useCallback(async () => {
    try {
      const res = await pb.collection("offices").getFullList({
        filter: 'is_active=true',
        sort: 'name',
        requestKey: null,
      });

      setOffices(res as unknown as OfficeItem[]);
    } catch (err) {
      console.error("Gagal ambil offices:", err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch profile with user data
      const list = await pb.collection("profiles").getFullList({
  filter: `user="${id}"`,
  expand: "user,office_id",
  requestKey: null,
});

if (list.length > 1) {
  alert("Data profile duplicate! Hubungi admin.");
}

if (list.length > 0) {
  const profileData = list[0] as unknown as EmployeeProfile;
  const userData = profileData.expand?.user;

  setUser(userData ?? null);
  setProfile(profileData);

  setName(profileData.name || userData?.name || "");
  setPosition(profileData.position || "");
  setDepartment(profileData.department || "");
  const rawSalary = profileData.salary;
  setSalaryDigits(
    rawSalary != null && !Number.isNaN(Number(rawSalary))
      ? String(Math.max(0, Math.floor(Number(rawSalary))))
      : ""
  );
  setOfficeId(profileData.office_id || "");
  setPhone(profileData.phone || "");
  setAddress(profileData.address || "");
  setDivision(profileData.division || "");
  setNik(profileData.nik || "");
  setNpwp(profileData.npwp || "");
  setEmployeeCode(profileData.employee_code || "");
  setProfileStatus(profileData.profile_status || "draft");
  setLateToleranceInput(String(Math.max(0, Math.floor(Number(profileData.late_tolerance ?? 10)))));
  setShiftStart(profileData.shift_start || "08:00");
  setShiftEnd(profileData.shift_end || "17:00");
  setJoinDate(joinDateFromPocketBase(profileData.join_date));

  const parsedQ = parseLeaveBookingsQuotaFromProfile(profileData.leave_bookings_quota);
  setLeaveBookingsQuota(
    parsedQ != null ? String(parsedQ) : String(getMaxBookingsPerMonth())
  );

} else {
  const userData = await pb.collection("users").getOne(id, {
    requestKey: null,
  });

  setUser(userData as unknown as EmployeeUser);
  setProfile(null);

  setName(userData.name || "");
  setPosition("");
  setDepartment("");
        setSalaryDigits("");
        setOfficeId("");
        setLeaveBookingsQuota(String(getMaxBookingsPerMonth()));
      }

    } catch {
      // Fallback if profile doesn't exist
      try {
        const userData = await pb.collection("users").getOne(id, {
          requestKey: null,
        });

        setUser(userData as unknown as EmployeeUser);
        setProfile(null);

        setName(userData.name || "");
        setPosition("");
        setDepartment("");
        setSalaryDigits("");
        setOfficeId("");
        setLeaveBookingsQuota(String(getMaxBookingsPerMonth()));

      } catch (e) {
        console.error("USER ERROR:", e);
        alert("User tidak ditemukan");
        router.push("/hr/employees");
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!id) return;
    fetchData();
    fetchOffices();
  }, [id, fetchData, fetchOffices]);

  // =========================
  // SAVE DATA
  // =========================
  const handleSave = async () => {
    if (!user) return;

    // Validation
    if (!officeId) {
      alert("Kantor / lokasi kerja wajib dipilih.");
      return;
    }

    const salaryNum = salaryDigits ? Number(salaryDigits) : 0;
    if (!position || !department || !salaryDigits || salaryNum <= 0) {
      alert(
        "Posisi, Departemen, dan Gaji wajib diisi (gaji harus lebih dari 0)."
      );
      return;
    }

    setSaving(true);

    try {
      const quotaNum =
        parseLeaveBookingsQuotaFromProfile(leaveBookingsQuota) ?? getMaxBookingsPerMonth();

      const lateTol = Math.min(
        999,
        Math.max(0, parseInt(lateToleranceInput.replace(/\D/g, "") || "0", 10) || 0)
      );

      // Keep users.name aligned with HR profile name.
      await pb.collection("users").update(user.id, { name });

      if (!profile) {
        // Create profile if doesn't exist
        await pb.collection("profiles").create({
          user: user.id,
          name,
          position,
          department,
          salary: salaryNum,
          office_id: officeId,
          phone,
          address,
          division,
          nik,
          npwp,
          employee_code: employeeCode,
          profile_status: profileStatus,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          late_tolerance: lateTol,
          join_date: joinDateToPocketBase(joinDate),
          [PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD]: quotaNum,
        });

        alert("Profile berhasil dibuat!");
      } else {
        // Update existing profile
        await pb.collection("profiles").update(profile.id, {
          name,
          position,
          department,
          salary: salaryNum,
          office_id: officeId,
          phone,
          address,
          division,
          nik,
          npwp,
          employee_code: employeeCode,
          profile_status: profileStatus,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          late_tolerance: lateTol,
          join_date: joinDateToPocketBase(joinDate),
          [PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD]: quotaNum,
        });

        alert("Data berhasil disimpan!");
      }

      router.push("/hr/employees");

    } catch (err: unknown) {
      const maybeAbort = typeof err === "object" && err !== null && "isAbort" in err && Boolean((err as { isAbort?: unknown }).isAbort);
      if (maybeAbort) return;

      console.error("SAVE ERROR:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Gagal menyimpan: " + message);
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // LOADING
  // =========================
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-500">Loading data karyawan...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // =========================
  // UI
  // =========================
  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-6 overflow-x-hidden px-4 py-6 sm:px-6">

      {/* HEADER */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-800 sm:text-2xl">
            Detail Karyawan
          </h1>
          <p className="mt-1 break-words text-sm text-slate-500">
            Kelola data akun & informasi HR
          </p>
        </div>

        <button
          onClick={() => router.back()}
          className="shrink-0 self-start text-sm text-slate-500 transition hover:text-slate-800"
        >
          ← Kembali
        </button>
      </div>

      {/* WARNING IF PROFILE DOESN'T EXIST */}
      {!profile && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <p className="font-semibold">⚠️ Profile belum dibuat</p>
          <p>Profile akan dibuat otomatis saat Anda menyimpan data.</p>
        </div>
      )}

      {/* ACCOUNT INFO */}
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          Informasi Akun
        </h2>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">

          <Input label="Nama" value={name} onChange={setName} />
          <Input label="Email" value={user.email || ""} disabled />
          <Input label="Role" value={user.role || ""} disabled />
          <Input
            label="Status"
            value={user.status || "active"}
            disabled
          />

        </div>
      </div>

      {/* HR DATA */}
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          Data HR
        </h2>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">

          <SelectField
            label="Posisi / Jabatan *"
            hint="Pilih jabatan yang paling sesuai dengan struktur perusahaan Anda."
            value={position}
            onChange={setPosition}
            options={POSITION_OPTIONS}
            placeholder="— Pilih posisi —"
          />

          <SelectField
            label="Departemen *"
            hint="Unit kerja atau bidang fungsi tempat karyawan bertugas sehari-hari."
            value={department}
            onChange={setDepartment}
            options={DEPARTMENT_OPTIONS}
            placeholder="— Pilih departemen —"
          />

          <SalaryInput
            label="Gaji Pokok *"
            digits={salaryDigits}
            onDigitsChange={setSalaryDigits}
            placeholder="Ketik angka, contoh: 5000000"
          />

          <Input label="Nomor Telepon" value={phone} onChange={setPhone} />
          <Input label="Alamat" value={address} onChange={setAddress} />
          <SelectField
            label="Divisi"
            hint="Kelompok organisasi yang lebih luas dari departemen (misalnya untuk pembagian wilayah atau kuota)."
            value={division}
            onChange={setDivision}
            options={DIVISION_OPTIONS}
            placeholder="— Pilih divisi (opsional) —"
            optional
          />
          <Input
            label="Kuota pengajuan cuti per bulan (per akun)"
            hint={`Hanya untuk pegawai ini. Maks. berapa kali kirim pengajuan cuti (pending + disetujui) dalam satu bulan kalender. Angka 1–52. Kosong/tidak valid → pakai default ${getMaxBookingsPerMonth()}×.`}
            type="number"
            value={leaveBookingsQuota}
            onChange={setLeaveBookingsQuota}
            placeholder={`${getMaxBookingsPerMonth()}`}
          />
          <Input label="NIK" value={nik} onChange={setNik} />
          <Input label="NPWP" value={npwp} onChange={setNpwp} />
          <Input label="Kode Karyawan" value={employeeCode} onChange={setEmployeeCode} />
          
          {/* TANGGAL BERGABUNG */}
          <div className="min-w-0">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Tanggal Bergabung
            </label>
            <input
              type="date"
              value={joinDate}
              onChange={(e) => setJoinDate(e.target.value)}
              className={`mt-1 overflow-x-auto ${FORM_CONTROL}`}
            />
          </div>

          {/* SHIFT */}
          <div className="col-span-2 mt-4 min-w-0">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Jam Kerja
              </h3>
              
              <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
                <div className="min-w-0">
                  <label className="text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">Jam Masuk</label>
                  <input
                  type="time"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className={`mt-1 overflow-x-auto ${FORM_CONTROL}`}
                  />
                  </div>
                  
                  <div className="min-w-0">
                    <label className="text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">Jam Pulang</label>
                    <input
                    type="time"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    className={`mt-1 overflow-x-auto ${FORM_CONTROL}`}
                    />
                    </div>
                    </div>
                    </div>
                    
                    {/* TOLERANSI — teks + inputMode numeric (type=number sering bermasalah saat diketik) */}
                    <Input
                      label="Toleransi Telat (menit)"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={lateToleranceInput}
                      onChange={(val) => {
                        const t = val.replace(/\D/g, "");
                        if (t.length > 3) return;
                        setLateToleranceInput(t);
                      }}
                      onBlur={() => {
                        const n = parseInt(lateToleranceInput || "0", 10);
                        const c = Number.isNaN(n) ? 0 : Math.min(999, Math.max(0, n));
                        setLateToleranceInput(String(c));
                      }}
                      placeholder="0–999"
                    />

          {/* OFFICE DROPDOWN */}
          <div className="min-w-0 md:col-span-2">
            <label className="text-sm text-slate-500 block mb-1">
              Kantor / lokasi kerja * {!officeId && <span className="text-red-500">(wajib)</span>}
            </label>
            <StyledSelect value={officeId} onChange={setOfficeId} placeholderTone>
              <option value="">— Pilih kantor —</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </StyledSelect>
            {offices.length === 0 && (
              <p className="text-xs text-red-500 mt-1">
                Belum ada kantor aktif. Tambahkan di menu Pengaturan GPS terlebih dahulu.
              </p>
            )}
          </div>

        </div>

        {/* ACTION */}
        <div className="flex justify-end mt-6 gap-3">
          <button
            onClick={() => router.back()}
            className="px-6 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !officeId}
            className="bg-blue-600 text-white px-6 py-2 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>

      {/* INFO */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-semibold mb-1">Catatan</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Kolom bertanda * wajib diisi.</li>
          <li>Kantor / lokasi kerja harus dipilih agar absensi berjalan.</li>
          <li>Data profil disimpan di koleksi profiles.</li>
        </ul>
      </div>

    </div>
  );
}

/** Gaya kontrol form — min-w-0 + text-base di HP (hindari teks tertimpa / zoom iOS); overflow horizontal aman. */
const FORM_CONTROL =
  "w-full min-w-0 max-w-full min-h-[2.75rem] rounded-xl border border-slate-300 bg-white px-3 py-3 text-base leading-snug outline-none transition-colors " +
  "text-slate-900 placeholder:text-slate-500 hover:border-slate-400 " +
  "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 " +
  "md:min-h-0 md:text-sm " +
  "[-webkit-tap-highlight-color:transparent]";

// =========================
// SELECT NATIF — tampilan seragam (chevron custom)
// =========================
function StyledSelect({
  value,
  onChange,
  children,
  placeholderTone,
}: {
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
  /** true = teks placeholder abu saat belum ada pilihan */
  placeholderTone?: boolean;
}) {
  const empty = placeholderTone !== false && value === "";
  return (
    <div className="relative mt-1 min-w-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FORM_CONTROL} appearance-none overflow-x-auto text-left pr-10 ${empty ? "text-slate-400" : "text-slate-800"}`}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400"
        aria-hidden
      >
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </div>
  );
}

// =========================
// SELECT FIELD (Bahasa Indonesia + opsi tetap)
// =========================
function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder,
  optional = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  optional?: boolean;
}) {
  const known = optionValuesSet(options);
  const isLegacy = Boolean(value && !known.has(value));

  return (
    <div className="min-w-0">
      <label className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
        <span className="min-w-0 break-words">{label}</span>
        {hint ? (
          <span
            className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 text-[11px] font-semibold leading-none text-slate-500"
            title={hint}
            aria-label={hint}
            role="img"
          >
            ?
          </span>
        ) : null}
      </label>
      <StyledSelect
        value={value}
        onChange={onChange}
        placeholderTone
      >
        <option value="">
          {placeholder ||
            (optional ? "— Kosongkan jika tidak dipakai —" : "— Pilih —")}
        </option>
        {isLegacy && (
          <option value={value}>{value} (data tersimpan)</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </StyledSelect>
    </div>
  );
}

// =========================
// INPUT COMPONENT
// =========================
interface InputProps {
  label: string;
  hint?: string;
  value: string | number;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}

function Input({
  label,
  hint,
  value,
  onChange,
  onBlur,
  disabled = false,
  placeholder = "",
  type = "text",
  inputMode,
  autoComplete,
}: InputProps) {
  return (
    <div className="min-w-0">
      <label className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
        <span className="min-w-0 break-words">{label}</span>
        {hint ? (
          <span
            className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 text-[11px] font-semibold leading-none text-slate-500"
            title={hint}
            aria-label={hint}
            role="img"
          >
            ?
          </span>
        ) : null}
      </label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onBlur={onBlur}
        onChange={(e) => onChange?.(e.target.value)}
        className={`mt-1 overflow-x-auto ${FORM_CONTROL} ${
          disabled ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
        }`}
      />
    </div>
  );
}

function formatSalaryIdDisplay(digits: string): string {
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("id-ID");
}

function SalaryInput({
  label,
  digits,
  onDigitsChange,
  placeholder,
}: {
  label: string;
  digits: string;
  onDigitsChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatSalaryIdDisplay(digits)}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "");
          onDigitsChange(next);
        }}
        className={`mt-1 overflow-x-auto ${FORM_CONTROL}`}
      />
      <p className="mt-1 break-words text-xs leading-snug text-slate-500 sm:text-slate-400">
        Ketik angka saja; pemisah ribuan (titik) mengikuti format Indonesia.
      </p>
    </div>
  );
}
