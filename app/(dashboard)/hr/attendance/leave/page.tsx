"use client";

import { useState } from "react";
import { pb } from "@/lib/pocketbase";
import { submitLeaveRequest } from "@/lib/leave";
import { useLocale } from "@/components/LocaleProvider";
import Link from "next/link";

/**
 * Legacy multi-date leave page.
 * Wave 2: no longer creates status=approved directly via PocketBase.
 * Each date is submitted as pending through the server leave API.
 */
export default function LeavePage() {
  const { t } = useLocale();
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addDate = (date: string) => {
    if (!dates.includes(date)) {
      setDates([...dates, date]);
    }
  };

  const removeDate = (date: string) => {
    setDates(dates.filter((d) => d !== date));
  };

  const submit = async () => {
    const user = pb.authStore.model;
    if (!user) return alert(t("hr.attendance.leaveBooking.mustLogin"));

    if (dates.length === 0) {
      return alert(t("hr.attendance.leaveBooking.pickDate"));
    }

    setLoading(true);

    try {
      const success: string[] = [];
      const failed: string[] = [];

      for (const date of dates) {
        const result = await submitLeaveRequest({
          userId: String(user.id),
          start_date: date,
          end_date: date,
          reason: "Cuti (booking — menunggu ACC HR)",
        });
        if (result.success) success.push(date);
        else failed.push(`${date}: ${result.message}`);
      }

      alert(
        t("hr.attendance.leaveBooking.result", {
          success: success.length,
          failed: failed.length,
          details: failed.join("\n"),
        }),
      );

      setDates([]);
    } catch (err) {
      console.error(err);
      alert(t("hr.attendance.leaveBooking.submitError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg p-6">
      <h1 className="mb-2 text-xl font-semibold">{t("hr.attendance.leaveBooking.title")}</h1>
      <p className="mb-4 text-sm text-slate-600">
        Pengajuan masuk sebagai <strong>pending</strong> dan perlu disetujui di{" "}
        <Link href="/hr/leave" className="text-indigo-600 underline">
          /hr/leave
        </Link>
        . (Wave 2: tidak lagi auto-approved.)
      </p>

      <input
        type="date"
        onChange={(e) => addDate(e.target.value)}
        className="mb-3 w-full border p-2"
      />

      <div className="mb-4">
        {dates.map((d) => (
          <div key={d} className="mb-1 flex justify-between bg-slate-100 p-2">
            <span>{d}</span>
            <button type="button" onClick={() => removeDate(d)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => void submit()}
        className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "..." : t("hr.attendance.leaveBooking.submit")}
      </button>
    </div>
  );
}
