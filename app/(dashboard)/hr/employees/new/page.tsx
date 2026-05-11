"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type UserRoleCode,
  getDefaultDashboardAccessForRole,
  normalizeAuthModel,
} from "@/lib/rbac";
import {
  getMaxBookingsPerMonth,
  PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD,
} from "@/lib/leave";

type RoleOption = {
  label: string;
  value: UserRoleCode;
};

const ROLE_OPTIONS: RoleOption[] = [
  { label: "HR", value: "hr" },
  { label: "Manager", value: "manager" },
  { label: "Staff Dashboard", value: "staff" },
  { label: "Staff Basic (No Dashboard)", value: "staff-basic" },
  { label: "Security (No Dashboard)", value: "security" },
  { label: "OB (No Dashboard)", value: "ob" },
];

export default function NewEmployeePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState<UserRoleCode>("staff");
  const [dashboardAccess, setDashboardAccess] = useState(
    getDefaultDashboardAccessForRole("staff")
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = pb.authStore.model;
    const auth = normalizeAuthModel(user);
    if (!user || auth.accountType !== "owner") {
      router.replace("/hr/employees");
      return;
    }
    setChecking(false);
  }, [router]);

  useEffect(() => {
    setDashboardAccess(getDefaultDashboardAccessForRole(roleCode));
  }, [roleCode]);

  const handleSubmit = async () => {
    if (!email || !password) {
      alert("Email & password wajib diisi");
      return;
    }

    setLoading(true);
    try {
      const user = await pb.collection("users").create({
        email,
        password,
        passwordConfirm: password,
        name,
        account_type: "user",
        role_code: roleCode,
        dashboard_access: dashboardAccess,
        role: roleCode,
        status: "inactive",
        joined_at: new Date().toISOString(),
      });

      // Auto copy users -> profiles at creation time (kuota cuti per akun = default sistem; HR bisa ubah di detail pegawai).
      await pb.collection("profiles").create({
        user: user.id,
        name,
        email,
        [PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD]: getMaxBookingsPerMonth(),
      });

      alert("User berhasil dibuat");
      router.push("/hr/employees");
    } catch (err: unknown) {
      console.error("CREATE ERROR:", err);
      alert(err instanceof Error ? err.message : "Gagal membuat user");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return <div className="p-6 text-slate-500">Checking access...</div>;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Tambah Karyawan Baru</h1>
        <p className="text-sm text-slate-500">Owner dapat membuat akun users + profile sekaligus.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border space-y-4 shadow-sm">
        <Input label="Nama" value={name} onChange={setName} />
        <Input label="Email" value={email} onChange={setEmail} />
        <Input label="Password" type="password" value={password} onChange={setPassword} />

        <Select
          label="Role User"
          value={roleCode}
          onChange={(value) => setRoleCode(value as UserRoleCode)}
          options={ROLE_OPTIONS}
        />

        <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50">
          <p className="text-sm font-medium text-slate-700">Akses Dashboard</p>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={dashboardAccess}
              onChange={(e) => setDashboardAccess(e.target.checked)}
              className="rounded border-slate-300"
            />
            User ini bisa mengakses dashboard
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : "Buat User"}
          </button>
          <button
            onClick={() => router.push("/hr/employees")}
            className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
};

function Input({ label, value, onChange, type = "text" }: InputProps) {
  return (
    <div>
      <label className="text-sm text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

type SelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: RoleOption[];
};

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <div>
      <label className="text-sm text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
