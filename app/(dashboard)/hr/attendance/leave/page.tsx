"use client";

import { useState } from "react";
import { pb } from "@/lib/pocketbase";
import {
  getSettings,
  getProfile,
  countUserLeaveInMonth,
  countDivisionLeaveOnDate,
  isUserAlreadyBooked,
} from "@/lib/leaves";
import { useLocale } from "@/components/LocaleProvider";

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
      const settings = await getSettings();
      const profile = await getProfile(user.id);

      const division = profile.division;
      const month = dates[0].slice(0, 7);

      const used = await countUserLeaveInMonth(user.id, month);

      const success: string[] = [];
      const failed: string[] = [];

      for (const date of dates) {
        if (used + success.length >= settings.max_leave_per_month) {
          failed.push(`${date} ${t("hr.attendance.leaveBooking.failMonthly")}`);
          continue;
        }

        const already = await isUserAlreadyBooked(user.id, date);
        if (already) {
          failed.push(`${date} ${t("hr.attendance.leaveBooking.failDuplicate")}`);
          continue;
        }

        const total = await countDivisionLeaveOnDate(division, date);
        if (total >= settings.max_people_per_day) {
          failed.push(`${date} ${t("hr.attendance.leaveBooking.failQuota")}`);
          continue;
        }

        const divisionVal =
          (profile as { division?: string }).division ||
          (profile as { devision?: string }).devision ||
          "-";
        const positionVal = (profile as { position?: string }).position || "-";

        await pb.collection("leave_requests").create({
          user: user.id,
          start_date: date,
          end_date: date,
          reason: "Cuti (booking HR — multi tanggal)",
          status: "approved",
          division: divisionVal,
          position: positionVal,
          booking_date: new Date().toISOString(),
        });

        success.push(date);
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
      <h1 className="mb-4 text-xl font-semibold">{t("hr.attendance.leaveBooking.title")}</h1>

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
              ❌
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 text-white"
      >
        {loading ? t("hr.attendance.leaveBooking.processing") : t("hr.attendance.leaveBooking.submit")}
      </button>
    </div>
  );
}
