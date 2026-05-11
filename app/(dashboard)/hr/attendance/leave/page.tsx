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

export default function LeavePage() {
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
    if (!user) return alert("Harus login");

    if (dates.length === 0) {
      return alert("Pilih minimal 1 tanggal");
    }

    setLoading(true);

    try {
      const settings = await getSettings();
      const profile = await getProfile(user.id);

      const division = profile.division;
      const month = dates[0].slice(0, 7); // YYYY-MM

      const used = await countUserLeaveInMonth(user.id, month);

      const success: string[] = [];
      const failed: string[] = [];

      for (const date of dates) {
        // ❗ cek limit bulanan
        if (used + success.length >= settings.max_leave_per_month) {
          failed.push(`${date} (limit bulanan habis)`);
          continue;
        }

        // ❗ cek double
        const already = await isUserAlreadyBooked(user.id, date);
        if (already) {
          failed.push(`${date} (sudah pernah booking)`);
          continue;
        }

        // ❗ cek kuota divisi
        const total = await countDivisionLeaveOnDate(division, date);
        if (total >= settings.max_people_per_day) {
          failed.push(`${date} (kuota penuh)`);
          continue;
        }

        // Samakan dengan lib/leave.ts (start/end per hari, bukan field `date` saja)
        const divisionVal =
          (profile as { division?: string }).division ||
          (profile as { devision?: string }).devision ||
          "-";
        const positionVal =
          (profile as { position?: string }).position || "-";

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
        `Berhasil: ${success.length}\nGagal: ${failed.length}\n\n${failed.join(
          "\n"
        )}`
      );

      setDates([]);

    } catch (err) {
      console.error(err);
      alert("Error submit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-4">
        Booking Cuti (Multi Tanggal)
      </h1>

      {/* INPUT TANGGAL */}
      <input
        type="date"
        onChange={(e) => addDate(e.target.value)}
        className="border p-2 mb-3 w-full"
      />

      {/* LIST */}
      <div className="mb-4">
        {dates.map((d) => (
          <div
            key={d}
            className="flex justify-between bg-slate-100 p-2 mb-1"
          >
            <span>{d}</span>
            <button onClick={() => removeDate(d)}>❌</button>
          </div>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        {loading ? "Proses..." : "Submit"}
      </button>
    </div>
  );
}