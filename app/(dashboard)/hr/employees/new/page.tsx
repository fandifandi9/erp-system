"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useMemo, useState } from "react";
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
import { getErrorMessage } from "@/lib/errors";
import { createDefaultProfileForUser } from "@/lib/profile";
import { useLocale } from "@/components/LocaleProvider";

const ROLE_CODES: UserRoleCode[] = ["hr", "manager", "staff", "staff-basic", "security", "ob"];

export default function NewEmployeePage() {
  const { t } = useLocale();
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

  const roleOptions = useMemo(
    () =>
      ROLE_CODES.map((value) => ({
        value,
        label: t(`hr.employees.new.roles.${value}`),
      })),
    [t]
  );

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
    const emailTrim = email.trim();
    if (!emailTrim || !password) {
      alert(t("hr.employees.new.errEmailPassword"));
      return;
    }

    const displayName = (
      name.trim() ||
      emailTrim.split("@")[0] ||
      t("hr.employees.new.defaultUserName")
    ).trim();

    setLoading(true);
    let createdUserId: string | null = null;
    try {
      const user = await pb.collection("users").create({
        email: emailTrim,
        password,
        passwordConfirm: password,
        name: displayName,
        account_type: "user",
        role_code: roleCode,
        dashboard_access: dashboardAccess,
        role: roleCode,
        status: "inactive",
      });
      createdUserId = user.id;

      const profile = await createDefaultProfileForUser(user.id);
      try {
        await pb.collection("profiles").update(profile.id, {
          [PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD]: getMaxBookingsPerMonth(),
        });
      } catch (quotaErr) {
        console.warn("leave_bookings_quota default tidak diset (field opsional di PB):", quotaErr);
      }

      alert(t("hr.employees.new.created"));
      router.push("/hr/employees");
    } catch (err: unknown) {
      console.error("CREATE ERROR:", err);
      if (createdUserId) {
        try {
          await pb.collection("users").delete(createdUserId);
        } catch (delErr) {
          console.error("Rollback user after profile error:", delErr);
        }
      }
      alert(getErrorMessage(err, t("hr.employees.new.createFailed")));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return <div className="p-6 text-slate-500">{t("hr.employees.new.checkingAccess")}</div>;
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">{t("hr.employees.new.title")}</h1>
        <p className="text-sm text-slate-500">{t("hr.employees.new.subtitle")}</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border space-y-4 shadow-sm">
        <Input label={t("hr.employees.new.name")} value={name} onChange={setName} />
        <Input label={t("hr.employees.new.email")} value={email} onChange={setEmail} />
        <Input
          label={t("hr.employees.new.password")}
          type="password"
          value={password}
          onChange={setPassword}
        />

        <Select
          label={t("hr.employees.new.role")}
          value={roleCode}
          onChange={(value) => setRoleCode(value as UserRoleCode)}
          options={roleOptions}
        />

        <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50">
          <p className="text-sm font-medium text-slate-700">{t("hr.employees.new.dashboardAccess")}</p>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={dashboardAccess}
              onChange={(e) => setDashboardAccess(e.target.checked)}
              className="rounded border-slate-300"
            />
            {t("hr.employees.new.dashboardAccessHint")}
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? t("hr.common.saving") : t("hr.employees.new.createUser")}
          </button>
          <button
            onClick={() => router.push("/hr/employees")}
            className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            {t("common.cancel")}
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
  options: { label: string; value: string }[];
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
