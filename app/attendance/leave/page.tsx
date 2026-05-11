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
  const [date, setDate] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const user = pb.authStore.model;

  const addDate = () => {
    if (!date) return;

    if (dates.includes(date)) {
      alert("Tanggal sudah ditambahkan");
      return;
    }

    setDates([...dates, date]);
    setDate("");
  };

  const removeDate = (d: string) => {
    setDates(dates.filter((x) => x !== d));
  };

  const submit = async () => {
    if (!user) return alert("User tidak ditemukan");
    if (dates.length === 0) return alert("Tambahkan minimal 1 tanggal");

    setLoading(true);

    try {
      const settings = await getSettings();
      const profile = await getProfile(user.id);
      const division = profile.department;

      for (const d of dates) {
        const month = d.slice(0, 7);

        // cek double
        const already = await isUserAlreadyBooked(user.id, d);
        if (already) {
          alert(`Sudah booking tanggal ${d}`);
          continue;
        }

        // cek limit bulanan
        const totalUser = await countUserLeaveInMonth(user.id, month);
        if (totalUser >= settings.max_leave_per_month) {
          alert(`Limit cuti bulan ${month} habis`);
          continue;
        }

        // cek kuota divisi
        const totalDiv = await countDivisionLeaveOnDate(division, d);
        if (totalDiv >= settings.max_people_per_day) {
          alert(`Kuota penuh di tanggal ${d}`);
          continue;
        }

        // simpan
        await pb.collection("leave_requests").create({
          user: user.id,
          date: d,
          division,
          status: "pending",
        });
      }

      alert("Pengajuan selesai");
      setDates([]);
    } catch (err) {
      console.error(err);
      alert("Error saat submit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-semibold mb-4">Ajukan Cuti</h1>

      {/* INPUT TANGGAL */}
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="border p-2 w-full mb-2"
      />

      {/* BUTTON TAMBAH */}
      <button
        onClick={addDate}
        className="bg-gray-500 text-white px-3 py-1 mb-4"
      >
        Tambah Tanggal
      </button>

      {/* LIST TANGGAL */}
      {dates.map((d, i) => (
        <div key={i} className="flex justify-between mb-2">
          <span>{d}</span>
          <button
            onClick={() => removeDate(d)}
            className="text-red-500"
          >
            X
          </button>
        </div>
      ))}

      {/* SUBMIT */}
      <button
        onClick={submit}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded w-full mt-4"
      >
        {loading ? "Loading..." : "Submit"}
      </button>
    </div>
  );
}